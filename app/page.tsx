import Link from "next/link";
import {
  BriefcaseBusiness,
  ChartCandlestick,
  Crown,
  Smartphone,
  Store,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-400 p-3 text-slate-950">
              <Crown size={28} />
            </div>

            <div>
              <p className="text-sm font-bold text-emerald-400">
                ONLINE ECONOMY GAME
              </p>

              <h1 className="text-2xl font-black">
                판매의 신
              </h1>
            </div>
          </div>

          <Link
            href="/login"
            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 font-bold text-emerald-300 transition hover:bg-emerald-400 hover:text-slate-950"
          >
            로그인
          </Link>
        </header>

        <div className="grid min-h-[70vh] items-center gap-10 py-14 lg:grid-cols-2">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">
              돈을 버는 모든 방법이 한곳에
            </div>

            <h2 className="mt-6 text-5xl font-black leading-tight sm:text-7xl">
              거래하고,
              <br />
              투자하고,
              <br />
              <span className="text-emerald-400">
                판매의 신이 되어라.
              </span>
            </h2>

            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
              주식 투자, 중고 거래, 사업 경영과
              직원 고용을 통해 자산을 늘리고
              최고의 판매왕 자리에 도전하세요.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/login"
                className="rounded-2xl bg-emerald-400 px-8 py-4 text-lg font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-1"
              >
                무료로 시작하기
              </Link>

              <Link
                href="/stocks"
                className="rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-lg font-bold transition hover:bg-white/10"
              >
                주식 구경하기
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={<ChartCandlestick />}
              title="판매증권"
              description="모든 유저가 동일한 주가를 보고 매수와 매도를 진행합니다."
            />

            <FeatureCard
              icon={<Store />}
              title="오이장터"
              description="유저와 NPC가 등록한 중고 물건을 사고 흥정할 수 있습니다."
            />

            <FeatureCard
              icon={<BriefcaseBusiness />}
              title="사업 경영"
              description="식당, 회사, 아이돌 엔터를 운영하고 직원을 고용합니다."
            />

            <FeatureCard
              icon={<Smartphone />}
              title="스마트폰"
              description="주식, 채팅, 장터, 랭킹을 게임 속 폰으로 확인합니다."
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
      <div className="inline-flex rounded-2xl bg-emerald-400/10 p-3 text-emerald-400">
        {icon}
      </div>

      <h3 className="mt-5 text-xl font-black">
        {title}
      </h3>

      <p className="mt-3 leading-7 text-slate-400">
        {description}
      </p>
    </article>
  );
}
