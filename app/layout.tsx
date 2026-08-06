import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "豆图工房 · 拼豆色号图生成器",
  description: "在浏览器本地将图片转换为 Mard 221 色号格子图。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "豆图工房 · 把喜欢的画面拼出来",
    description: "上传图片，免费生成可以照着拼的色号图纸。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "豆图工房拼豆图纸工具" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
