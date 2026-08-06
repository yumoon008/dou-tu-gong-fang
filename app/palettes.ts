export type PaletteId = "mard" | "perler" | "hama";
export type BoardSize = 52 | 104;
export type RenderStyle = "clear" | "soft";

export type PaletteColor = {
  brand: PaletteId;
  code: string;
  name: string;
  rgb: [number, number, number];
};

type BaseColor = [string, string, number, number, number];

const make = (brand: PaletteId, colors: BaseColor[]): PaletteColor[] =>
  colors.map(([code, name, r, g, b]) => ({ brand, code, name, rgb: [r, g, b] }));

// v2026.08 · 常用基础色组；RGB 仅用于屏幕近似匹配。
export const palettes: Record<PaletteId, PaletteColor[]> = {
  mard: make("mard", [
    ["A1", "白色", 247, 247, 242], ["A2", "奶油白", 255, 241, 207], ["A3", "浅灰", 190, 195, 190], ["A4", "灰色", 112, 119, 119], ["A5", "黑色", 35, 35, 36],
    ["B1", "浅黄", 255, 231, 85], ["B2", "黄色", 255, 194, 32], ["B3", "橙色", 246, 126, 34], ["B4", "深橙", 224, 78, 35], ["B5", "棕色", 113, 67, 45],
    ["C1", "浅肤色", 255, 218, 184], ["C2", "肤色", 238, 169, 123], ["C3", "珊瑚粉", 250, 139, 139], ["C4", "红色", 215, 48, 55], ["C5", "酒红", 128, 32, 52],
    ["D1", "浅粉", 255, 195, 210], ["D2", "粉色", 245, 122, 166], ["D3", "玫红", 218, 55, 126], ["D4", "浅紫", 190, 152, 214], ["D5", "紫色", 116, 65, 154],
    ["E1", "宝蓝", 43, 91, 176], ["E2", "蓝色", 39, 133, 201], ["E3", "湖蓝", 38, 177, 190], ["E4", "浅蓝", 146, 211, 227], ["E5", "藏青", 33, 53, 91],
    ["F1", "薄荷绿", 157, 222, 190], ["F2", "绿色", 52, 171, 107], ["F3", "草绿", 110, 180, 68], ["F4", "深绿", 37, 105, 69], ["F5", "军绿", 95, 108, 62],
  ]),
  perler: make("perler", [
    ["P01", "White", 246, 246, 240], ["P02", "Cream", 255, 236, 190], ["P03", "Light Gray", 180, 184, 181], ["P04", "Dark Gray", 89, 94, 96], ["P05", "Black", 38, 38, 39],
    ["P06", "Yellow", 255, 218, 45], ["P07", "Cheddar", 255, 168, 34], ["P08", "Orange", 241, 105, 35], ["P09", "Red", 209, 42, 49], ["P10", "Cranapple", 139, 35, 51],
    ["P11", "Blush", 250, 180, 173], ["P12", "Pink", 246, 135, 169], ["P13", "Hot Coral", 242, 75, 111], ["P14", "Plum", 122, 57, 119], ["P15", "Purple", 105, 71, 158],
    ["P16", "Pastel Lavender", 185, 160, 210], ["P17", "Light Blue", 116, 197, 224], ["P18", "Toothpaste", 45, 184, 187], ["P19", "Blue", 37, 117, 190], ["P20", "Dark Blue", 38, 59, 116],
    ["P21", "Pastel Green", 145, 207, 166], ["P22", "Green", 44, 150, 89], ["P23", "Kiwi Lime", 113, 188, 64], ["P24", "Dark Green", 35, 102, 62], ["P25", "Olive", 119, 123, 58],
    ["P26", "Tan", 211, 164, 105], ["P27", "Brown", 119, 72, 45], ["P28", "Rust", 161, 69, 45], ["P29", "Sand", 226, 195, 147], ["P30", "Clear", 235, 239, 228],
  ]),
  hama: make("hama", [
    ["01", "White", 245, 245, 238], ["02", "Cream", 255, 236, 194], ["17", "Grey", 158, 165, 164], ["71", "Dark Grey", 81, 87, 89], ["18", "Black", 35, 35, 36],
    ["03", "Yellow", 255, 218, 38], ["04", "Orange", 239, 111, 34], ["05", "Red", 207, 42, 47], ["06", "Pink", 238, 131, 168], ["28", "Pastel Red", 247, 162, 151],
    ["07", "Purple", 117, 67, 145], ["45", "Pastel Purple", 185, 157, 207], ["08", "Blue", 43, 111, 181], ["09", "Light Blue", 103, 191, 220], ["31", "Turquoise", 29, 171, 172],
    ["10", "Green", 43, 145, 77], ["11", "Light Green", 113, 183, 69], ["47", "Pastel Green", 149, 207, 165], ["12", "Brown", 112, 68, 43], ["20", "Reddish Brown", 154, 65, 43],
    ["21", "Light Brown", 195, 137, 84], ["22", "Dark Red", 133, 37, 48], ["26", "Beige", 229, 193, 149], ["30", "Burgundy", 110, 36, 60], ["32", "Neon Yellow", 218, 235, 45],
    ["33", "Neon Red", 246, 72, 77], ["34", "Neon Green", 88, 213, 91], ["36", "Neon Blue", 50, 179, 218], ["42", "Fluorescent Green", 159, 224, 65], ["46", "Pastel Blue", 151, 204, 226],
  ]),
};

export const paletteLabels: Record<PaletteId, string> = { mard: "Mard", perler: "Perler", hama: "Hama" };
