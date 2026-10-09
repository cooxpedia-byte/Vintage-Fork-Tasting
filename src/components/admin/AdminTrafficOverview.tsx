import type { SalesPeriod } from "@/lib/admin/sales-periods";
import { TRAFFIC_PERIODS, type TrafficOverview } from "@/lib/admin/traffic";

export function AdminTrafficOverview({ traffic, salesPeriod }: { traffic: TrafficOverview; salesPeriod: SalesPeriod }) {
  const selectedPeriod = TRAFFIC_PERIODS.find(period => period.value === traffic.period)!.label;
  const available = traffic.status === "complete" || traffic.status === "partial";
  const count = (value: number | null) => value === null ? "—" : value.toLocaleString("en-CA");
  const cards = [
    { label: "Visitors", value: count(traffic.visitors), detail: "Distinct consenting browsers recorded in the selected period." },
    { label: "Total page views", value: count(traffic.pageViews), detail: "Recorded public page views on vintagefork.ca." },
    { label: "Average page views", value: traffic.averagePageViews === null ? "—" : traffic.averagePageViews.toLocaleString("en-CA", { maximumFractionDigits: 2 }), detail: available && traffic.visitors === 0 ? "No consenting browsers recorded in this period." : "Recorded page views per consenting browser in the selected period." },
  ];

  return (
    <section className="admin-panel admin-traffic-panel" aria-labelledby="admin-traffic-heading">
      <div className="admin-panel-heading">
        <div><p className="eyebrow">{selectedPeriod}</p><h2 id="admin-traffic-heading">Traffic</h2></div>
        <form action="/admin" method="get" className="admin-sales-filter admin-traffic-filter">
          <input type="hidden" name="salesPeriod" value={salesPeriod} />
          <label htmlFor="admin-traffic-period">Traffic period</label>
          <div>
            <select id="admin-traffic-period" name="trafficPeriod" defaultValue={traffic.period}>
              {TRAFFIC_PERIODS.map(period => <option value={period.value} key={period.value}>{period.label}</option>)}
            </select>
            <button type="submit">Apply</button>
          </div>
        </form>
      </div>
      <p className="admin-traffic-timezone">Calendar periods use Edmonton time. Weeks start on Monday.</p>
      <p className="admin-traffic-timezone">Only consenting browsers on public vintagefork.ca pages are measured. Private pages and mobile app visits are excluded.</p>
      <div className="admin-kpi-grid admin-kpi-grid--three" aria-label="Website traffic summary">
        {cards.map(card => <article className="admin-kpi-card admin-traffic-card" key={card.label}>
          <span>{card.label}</span>
          <strong aria-label={card.value === "—" ? (available ? "No visitor average" : "Unavailable") : undefined}>{card.value}</strong>
          <small>{selectedPeriod}{traffic.status === "partial" ? traffic.captureLimited ? " · Incomplete capture" : " · Partial period" : available ? "" : " · Unavailable"}</small>
          <p>{card.detail}</p>
        </article>)}
      </div>
      <p className="admin-traffic-unavailable" role="status">{traffic.message}</p>
    </section>
  );
}
