"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertImage, type PatternResult } from "./conversion";
import { downsampleLinearLight } from "./image-processing";
import { mardPalette, paletteLabels, palettes, type BoardSize, type RenderStyle } from "./palettes";

type ViewMode = "color" | "codes";
type Crop = { zoom: number; x: number; y: number };
const MAX_FILE = 25 * 1024 * 1024;

function DownloadIcon() { return <span aria-hidden="true">↓</span>; }
function LockIcon() { return <span aria-hidden="true">◇</span>; }

export default function PatternStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const resultDragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [boardSize, setBoardSize] = useState<BoardSize>(52);
  const [style, setStyle] = useState<RenderStyle>("clear");
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [pattern, setPattern] = useState<PatternResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isConverting, setIsConverting] = useState(false);

  const processFile = useCallback((file?: File) => {
    setError("");
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("请选择 JPEG、PNG 或 WebP 图片。"); return; }
    if (file.size > MAX_FILE) { setError("图片超过 25 MB，请压缩后再试。"); return; }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img; setImageUrl(url); setFileName(file.name.replace(/\.[^.]+$/, ""));
      setCrop({ zoom: 1, x: 0, y: 0 }); setPattern(null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("这张图片无法解码，请换一张试试。"); };
    img.src = url;
  }, [imageUrl]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) processFile(file);
    };
    window.addEventListener("paste", onPaste); return () => window.removeEventListener("paste", onPaste);
  }, [processFile]);

  const drawCrop = useCallback(() => {
    const canvas = cropCanvasRef.current, img = imageRef.current;
    if (!canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.fillStyle = "#f7efe3"; ctx.fillRect(0, 0, rect.width, rect.height);
    const base = Math.max(rect.width / img.width, rect.height / img.height);
    const scale = base * crop.zoom;
    const w = img.width * scale, h = img.height * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (rect.width - w) / 2 + crop.x, (rect.height - h) / 2 + crop.y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.46)"; ctx.lineWidth = 1;
    const step = rect.width / (boardSize === 52 ? 13 : 16);
    for (let p = step; p < rect.width; p += step) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, rect.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(rect.width, p); ctx.stroke(); }
  }, [crop, boardSize]);

  useEffect(() => { drawCrop(); window.addEventListener("resize", drawCrop); return () => window.removeEventListener("resize", drawCrop); }, [drawCrop]);

  const createSourceImageData = () => {
    const img = imageRef.current, preview = cropCanvasRef.current;
    if (!img || !preview) return null;
    // Sample at a higher resolution first, then average in linear light. Direct
    // browser downscaling averages gamma-encoded sRGB and makes contrasting
    // fur, windows and other fine details look too dark and muddy.
    const sampleFactor = 8;
    const sampleSize = boardSize * sampleFactor;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = sampleSize; sampleCanvas.height = sampleSize;
    const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!ctx) return null;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, sampleSize, sampleSize);
    const previewSize = preview.getBoundingClientRect().width;
    const base = Math.max(previewSize / img.width, previewSize / img.height);
    const scale = base * crop.zoom;
    const sx = ((previewSize - img.width * scale) / 2 + crop.x) * sampleSize / previewSize;
    const sy = ((previewSize - img.height * scale) / 2 + crop.y) * sampleSize / previewSize;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, img.width * scale * sampleSize / previewSize, img.height * scale * sampleSize / previewSize);
    const sampled = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const result = downsampleLinearLight(sampled, boardSize, sampleFactor);
    return new ImageData(new Uint8ClampedArray(result.data), result.width, result.height);
  };

  const generate = () => {
    const data = createSourceImageData(); if (!data) return;
    setIsConverting(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setPattern(convertImage(data, boardSize, mardPalette, "mard", style));
      setViewScale(1); setViewOffset({ x: 0, y: 0 }); setIsConverting(false);
      setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }));
  };

  const drawPattern = useCallback(() => {
    const canvas = resultCanvasRef.current; if (!canvas || !pattern) return;
    const wrap = canvas.parentElement; if (!wrap) return;
    const palette = palettes[pattern.paletteId];
    const viewport = Math.min(wrap.clientWidth, 720), dpr = window.devicePixelRatio || 1;
    canvas.width = viewport * dpr; canvas.height = viewport * dpr; canvas.style.width = `${viewport}px`; canvas.style.height = `${viewport}px`;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.fillStyle = "#f3eee7"; ctx.fillRect(0, 0, viewport, viewport);
    ctx.save(); ctx.translate(viewport / 2 + viewOffset.x, viewport / 2 + viewOffset.y); ctx.scale(viewScale, viewScale); ctx.translate(-viewport / 2, -viewport / 2);
    const cell = viewport / pattern.size;
    for (let y = 0; y < pattern.size; y++) for (let x = 0; x < pattern.size; x++) {
      const color = palette[pattern.indices[y * pattern.size + x]];
      ctx.fillStyle = `rgb(${color.rgb.join(",")})`; ctx.fillRect(x * cell, y * cell, cell + .5, cell + .5);
      if (viewMode === "codes" && cell * viewScale >= 8) {
        const lum = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114;
        ctx.fillStyle = lum > 145 ? "#29251f" : "#fff"; ctx.font = `600 ${Math.max(3.5, cell * .34)}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(color.code, (x + .5) * cell, (y + .52) * cell, cell * .92);
      }
    }
    if (viewMode === "codes") {
      ctx.strokeStyle = "rgba(50,43,34,.14)"; ctx.lineWidth = .35 / viewScale;
      for (let i = 0; i <= pattern.size; i++) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, viewport); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(viewport, i * cell); ctx.stroke(); }
      ctx.strokeStyle = "rgba(43,37,30,.52)"; ctx.lineWidth = 1.25 / viewScale;
      for (let i = 0; i <= pattern.size; i += 13) { ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, viewport); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(viewport, i * cell); ctx.stroke(); }
    }
    ctx.restore();
  }, [pattern, viewMode, viewScale, viewOffset]);

  useEffect(() => { drawPattern(); window.addEventListener("resize", drawPattern); return () => window.removeEventListener("resize", drawPattern); }, [drawPattern]);

  const exportPng = () => {
    if (!pattern) return;
    const palette = palettes[pattern.paletteId], cell = pattern.size === 52 ? 32 : 24, margin = 90;
    const grid = cell * pattern.size, legendCols = 4, legendRows = Math.ceil(pattern.usage.length / legendCols), legendH = legendRows * 60 + 130;
    const out = document.createElement("canvas"); out.width = grid + margin * 2; out.height = grid + legendH + margin * 2;
    const ctx = out.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#fffaf3"; ctx.fillRect(0, 0, out.width, out.height); ctx.fillStyle = "#27231f"; ctx.font = "700 38px Arial"; ctx.fillText(fileName || "我的拼豆图纸", margin, 58);
    ctx.font = "22px Arial"; ctx.fillStyle = "#6d645a"; ctx.fillText(`${pattern.size}×${pattern.size} · ${paletteLabels[pattern.paletteId]} · ${pattern.style === "clear" ? "清晰" : "柔和"}模式`, margin, 94);
    for (let y = 0; y < pattern.size; y++) for (let x = 0; x < pattern.size; x++) {
      const color = palette[pattern.indices[y * pattern.size + x]], px = margin + x * cell, py = 125 + y * cell;
      ctx.fillStyle = `rgb(${color.rgb.join(",")})`; ctx.fillRect(px, py, cell, cell);
      const lum = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114; ctx.fillStyle = lum > 145 ? "#24211d" : "#fff";
      ctx.font = `600 ${Math.max(8, cell * .29)}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(color.code, px + cell / 2, py + cell / 2, cell - 2);
    }
    ctx.strokeStyle = "rgba(40,35,30,.14)"; ctx.lineWidth = .7;
    for (let i = 0; i <= pattern.size; i++) { const p = margin + i * cell; ctx.beginPath(); ctx.moveTo(p, 125); ctx.lineTo(p, 125 + grid); ctx.stroke(); ctx.beginPath(); ctx.moveTo(margin, 125 + i * cell); ctx.lineTo(margin + grid, 125 + i * cell); ctx.stroke(); }
    ctx.strokeStyle = "rgba(61,55,47,.55)"; ctx.lineWidth = 2;
    for (let i = 0; i <= pattern.size; i += 13) { const p = margin + i * cell; ctx.beginPath(); ctx.moveTo(p, 125); ctx.lineTo(p, 125 + grid); ctx.stroke(); ctx.beginPath(); ctx.moveTo(margin, 125 + i * cell); ctx.lineTo(margin + grid, 125 + i * cell); ctx.stroke(); }
    const ly = 125 + grid + 65; ctx.textAlign = "left"; ctx.fillStyle = "#27231f"; ctx.font = "700 28px Arial"; ctx.fillText(`用量表 · ${pattern.usage.length} 色`, margin, ly);
    pattern.usage.forEach((item, i) => { const col = i % legendCols, row = Math.floor(i / legendCols), x = margin + col * (grid / legendCols), y = ly + 42 + row * 60; ctx.fillStyle = `rgb(${item.color.rgb.join(",")})`; ctx.fillRect(x, y, 34, 34); ctx.strokeStyle = "#cfc5b8"; ctx.lineWidth = 1; ctx.strokeRect(x, y, 34, 34); ctx.fillStyle = "#342e28"; ctx.font = "600 18px Arial"; ctx.fillText(`${item.color.code}  ${item.count} 颗`, x + 45, y + 21); });
    const link = document.createElement("a"); link.download = `${fileName || "拼豆图纸"}-${pattern.size}-${paletteLabels[pattern.paletteId]}.png`; link.href = out.toDataURL("image/png"); link.click();
  };

  const onCropPointerDown = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = { x: e.clientX, y: e.clientY, startX: crop.x, startY: crop.y }; };
  const onCropPointerMove = (e: React.PointerEvent) => { if (!dragRef.current) return; setCrop((c) => ({ ...c, x: dragRef.current!.startX + e.clientX - dragRef.current!.x, y: dragRef.current!.startY + e.clientY - dragRef.current!.y })); };
  const onResultPointerDown = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); resultDragRef.current = { x: e.clientX, y: e.clientY, startX: viewOffset.x, startY: viewOffset.y }; };

  const totalColors = pattern?.usage.length ?? 0;
  const topColors = useMemo(() => pattern?.usage.slice(0, 6) ?? [], [pattern]);

  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="豆图工房首页"><span className="brand-mark"><i/><i/><i/><i/></span><span>豆图工房<small>BEAD PATTERN STUDIO</small></span></a><div className="privacy"><LockIcon /> 图片仅在你的浏览器中处理</div></header>

    <section className="hero" id="top"><div><p className="eyebrow">PIXELS INTO SOMETHING REAL</p><h1>把喜欢的画面，<br/><em>一格一格拼出来。</em></h1><p className="hero-copy">上传一张图片，选好板型和转换风格，<br className="desktop"/>几秒就能获得 Mard 221 色高清图纸。</p></div><div className="hero-art" aria-hidden="true"><div className="sample-card"><div className="pixel-flower">{Array.from({length: 81}, (_, i) => <i key={i} className={`p${i}`}/>)}</div><span>52 × 52</span></div><div className="floating-chip chip-a">A4</div><div className="floating-chip chip-b">D2</div><div className="floating-chip chip-c">F1</div></div></section>

    <nav className="steps" aria-label="制作步骤"><a className="active" href="#create"><b>01</b><span>上传与设置<small>选择你的图片与拼法</small></span></a><a href="#crop"><b>02</b><span>调整构图<small>对准你最想保留的画面</small></span></a><a href="#result"><b>03</b><span>查看与导出<small>收下你的色号图纸</small></span></a></nav>

    <section className="workspace" id="create"><div className="section-heading"><p>STEP 01</p><h2>选一张你想拼出来的图片</h2><span>图片不会被上传或保存，所有处理都在你的设备上完成。</span></div>
      <div className="setup-grid"><div className={`upload-card ${imageUrl ? "has-image" : ""}`} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault();processFile(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" ")fileRef.current?.click();}} aria-label="上传图片">
        {imageUrl ? <><img src={imageUrl} alt="已上传图片预览"/><div className="replace">点击更换图片</div></> : <><div className="upload-icon">↑</div><h3>把图片放在这里</h3><p>拖入、粘贴，或 <u>选择文件</u></p><small>JPEG · PNG · WebP · 最大 25 MB</small></>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>processFile(e.target.files?.[0])}/></div>
        <div className="settings-card"><fieldset><legend>板型大小</legend><div className="choice-row board-choices">{([52,104] as BoardSize[]).map(size=><button key={size} className={boardSize===size?"selected":""} onClick={()=>{setBoardSize(size);setPattern(null);}}><b>{size===52?"小板":"大板"}</b><span>{size} × {size}</span><small>{(size*size).toLocaleString()} 颗</small></button>)}</div></fieldset>
          <div className="palette-fixed"><span className="palette-dot"/><div><b>Mard 221 标准色卡</b><small>A–H 与 M 系列 · 221 种颜色</small></div><strong>已启用</strong></div><p className="palette-note">色卡 v2026.08 · 屏幕显示与实物可能存在轻微色差</p>
          <fieldset><legend>转换风格</legend><div className="choice-row style-choices"><button className={style==="clear"?"selected":""} onClick={()=>{setStyle("clear");setPattern(null);}}><span className="style-pixels crisp"/><span><b>清晰模式</b><small>色块干净，更易照图拼制</small></span></button><button className={style==="soft"?"selected":""} onClick={()=>{setStyle("soft");setPattern(null);}}><span className="style-pixels soft"/><span><b>柔和模式</b><small>保留渐变与更多画面细节</small></span></button></div></fieldset>
        </div></div>{error&&<p className="error" role="alert">{error}</p>}</section>

    {imageUrl && <section className="workspace crop-section" id="crop"><div className="section-heading"><p>STEP 02</p><h2>调整构图</h2><span>拖动图片调整位置，用滑块放大细节。</span></div><div className="crop-layout"><div className="crop-frame" onPointerDown={onCropPointerDown} onPointerMove={onCropPointerMove} onPointerUp={()=>dragRef.current=null} onPointerCancel={()=>dragRef.current=null}><canvas ref={cropCanvasRef}/><div className="crop-corners"/></div><div className="crop-tools"><label>图片缩放 <b>{Math.round(crop.zoom*100)}%</b><input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(e)=>setCrop(c=>({...c,zoom:Number(e.target.value)}))}/></label><button className="secondary" onClick={()=>setCrop({zoom:1,x:0,y:0})}>重置构图</button><div className="crop-summary"><span>{boardSize}×{boardSize}</span><p>白色线条仅用于辅助构图，最终图纸将以 13 格为一区标注。</p></div><button className="primary" onClick={generate} disabled={isConverting}>{isConverting?"正在调配色号…":"生成拼豆图纸"}<span>→</span></button></div></div></section>}

    {pattern && <section className="result-section" id="result"><div className="workspace"><div className="result-header"><div className="section-heading"><p>STEP 03</p><h2>你的拼豆图纸已经准备好了</h2><span>{pattern.size}×{pattern.size} · {paletteLabels[pattern.paletteId]} · {pattern.style==="clear"?"清晰":"柔和"}模式</span></div><button className="primary download" onClick={exportPng}><DownloadIcon/> 下载高清 PNG</button></div>
      <div className="result-grid"><div className="viewer-card"><div className="viewer-toolbar"><div className="segmented"><button className={viewMode==="color"?"active":""} onClick={()=>setViewMode("color")}>纯色预览</button><button className={viewMode==="codes"?"active":""} onClick={()=>setViewMode("codes")}>色号格子</button></div><div className="zoom-controls"><button onClick={()=>setViewScale(v=>Math.max(1,v-.35))} aria-label="缩小">−</button><span>{Math.round(viewScale*100)}%</span><button onClick={()=>setViewScale(v=>Math.min(5,v+.35))} aria-label="放大">+</button><button onClick={()=>{setViewScale(1);setViewOffset({x:0,y:0});}} aria-label="重置视图">↺</button></div></div><div className="canvas-wrap"><canvas ref={resultCanvasRef} onPointerDown={onResultPointerDown} onPointerMove={(e)=>{if(!resultDragRef.current)return;setViewOffset({x:resultDragRef.current.startX+e.clientX-resultDragRef.current.x,y:resultDragRef.current.startY+e.clientY-resultDragRef.current.y});}} onPointerUp={()=>resultDragRef.current=null} onPointerCancel={()=>resultDragRef.current=null}/></div><p className="viewer-tip">放大后拖动查看细节 · 每 13 格粗线分区</p></div>
        <aside className="usage-card"><div className="usage-title"><div><p>用量清单</p><h3>{paletteLabels[pattern.paletteId]} 色号</h3></div><span>{totalColors} 种颜色</span></div><div className="totals"><div><b>{(pattern.size*pattern.size).toLocaleString()}</b><span>总颗数</span></div><div className="color-stack">{topColors.map(item=><i key={item.color.code} style={{background:`rgb(${item.color.rgb.join(",")})`}}/> )}</div></div><div className="usage-list">{pattern.usage.map(item=><div className="usage-item" key={item.color.code}><i style={{background:`rgb(${item.color.rgb.join(",")})`}}/><div><b>{item.color.code}</b><span>{item.color.name}</span></div><strong>{item.count.toLocaleString()} <small>颗</small></strong><em>{item.percent.toFixed(1)}%</em></div>)}</div><button className="outline-download" onClick={exportPng}><DownloadIcon/> 下载图纸与用量表</button></aside></div></div></section>}

    <section className="trust"><div><span className="trust-icon">◇</span><h3>只在你的设备上发生</h3><p>我们不会上传、保存或查看你的图片。<br/>关闭页面后，本次作品也会随之消失。</p></div><div className="trust-beads" aria-hidden="true">{["#ef9aaa","#f2bb49","#7bc5b2","#6e94c4","#b78ac5"].map((c,i)=><i key={i} style={{background:c}}/>)}</div></section>
    <footer><a className="brand" href="#top"><span className="brand-mark"><i/><i/><i/><i/></span><span>豆图工房<small>BEAD PATTERN STUDIO</small></span></a><p>为每一个想把灵感拼出来的人而做。</p><span>色号与实物可能存在轻微色差</span></footer>
  </main>;
}
