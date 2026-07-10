import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "판매의 신",
  description: "주식, 중고 거래, 사업으로 돈을 버는 온라인 경제 게임",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
