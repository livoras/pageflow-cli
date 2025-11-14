import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小红书笔记数据监控 - Pageflow",
  description: "实时监控小红书帖子数据",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
