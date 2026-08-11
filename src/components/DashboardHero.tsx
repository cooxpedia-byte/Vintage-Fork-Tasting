import type { ReactNode } from "react";

type DashboardHeroProps = {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function DashboardHero({ eyebrow, title, lede, actions, className = "" }: DashboardHeroProps) {
  return <section className={`dashboard-hero ${className}`.trim()}>
    <div className="dashboard-hero-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      {lede && <p className="page-lede">{lede}</p>}
    </div>
    {actions && <div className="dashboard-hero-actions">{actions}</div>}
  </section>;
}
