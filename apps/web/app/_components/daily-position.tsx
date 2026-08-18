import type { TodayPresentation } from "../../lib/presentation/today";

export function DailyPosition({ presentation }: { presentation: TodayPresentation }) {
  return (
    <section className={`daily-position tone-${presentation.tone}`}>
      <p className="eyebrow">Your position today</p>
      <h1>{presentation.title}</h1>
      <p>{presentation.consequence}</p>
    </section>
  );
}
