import type { Metadata } from "next";
import PatternStudio from "./PatternStudio";

export const metadata: Metadata = {
  title: "豆图工房 · 把照片变成拼豆图纸",
  description: "在浏览器本地将图片转换为 Mard、Perler 或 Hama 色号格子图。",
};

export default function Home() {
  return <PatternStudio />;
}
