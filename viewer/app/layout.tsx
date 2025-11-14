import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pageflow Webhook Viewer",
  description: "View webhook data from Pageflow jobs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
