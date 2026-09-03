import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    app: 'KX EXCHANGE',
    build: '2026.09.03-render-root',
    purpose: 'real-stock-exchange-game'
  });
}
