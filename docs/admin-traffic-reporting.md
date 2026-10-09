# Staff traffic reporting

The commerce overview has an independent traffic filter: Today, Yesterday, Week
to date, Last week, and Last month. Sales also supports Yesterday. All intervals
use Edmonton calendar boundaries, start weeks on Monday, and have an exclusive
end. Changing either filter preserves the other selection.

## Data source contract

The dashboard uses the existing authorized commerce administrator session to call
`vf_admin_traffic_summary_v1(p_start timestamptz, p_end timestamptz)`. The function
must enforce administrator access and return a JSON object:

```json
{
  "visitors": 12,
  "page_views": 35,
  "capture_started_at": "2026-10-09T18:00:00.000Z"
}
```

The sample above illustrates the schema; it is not store traffic data. Visitors
are distinct captured anonymous visitor identities across the entire requested
interval. Page views count captured storefront page views in that interval. Do
not add daily unique visitors: a visitor returning on another day counts once in
a week or month. Average page views is page views divided by visitors, with no
average when no visitor was captured. The function must not return raw identities,
IPs, emails, page URLs or customer data to the dashboard.

`capture_started_at` records the start of measurement, even when there are no
page views. Before that timestamp, the dashboard shows unavailable metrics.
When an interval overlaps the start of measurement, it labels the totals as a
partial period and identifies when measurement began. Connected, fully measured
empty intervals show zero visitors and page views; an absent source shows dashes.

## Connection requirement

At implementation time, neither this app nor the storefront records website page
views. The storefront records checkout events, which cannot establish total site
visitors or page views. Tasting event statistics and commerce customer counts
also cannot be used as substitutes.

Connect an existing traffic provider through this protected aggregate function,
or implement approved traffic measurement in the storefront with its consent
rules. This dashboard change itself adds no tracking, credentials, database
schema or production mutation. If the function is absent, unavailable, denied or
returns inconsistent data, the section does not fabricate counts.
