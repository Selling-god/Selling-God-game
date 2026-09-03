import './globals.css';

export const metadata = {
  title: 'KX Exchange — Stock Market Simulator',
  description: '실제 거래소 구조를 게임으로 옮긴 멀티플레이 주식 시뮬레이터',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
