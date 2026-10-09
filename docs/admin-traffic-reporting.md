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
  "capture_started_at": "2026-10-09T18:00:00.000Z",
  "retention_days": 63,
  "limited_events": 0,
  "capture_limited": false
}
```

The sample illustrates the schema, not actual traffic. The source is consent-aware
first-party capture on public `vintagefork.ca` pages. Visitors means distinct
consenting browser IDs across the entire requested interval; one person can use
multiple browsers, and clearing browser storage creates a new ID. IDs expire after
90 days of inactivity. Do not add daily unique visitors: a browser returning on
another day counts once in a week or month. Page views count accepted public-page
navigation events. Average page views is page views divided by browsers, with no
average when no browser was captured.

The capture excludes cart, checkout, account, authentication, admin, POS, private
transition/connection pages and native apps, and honors GPC/DNT. Raw events are
retained for 63 days; the dashboard's longest historical filter is Last month.
The aggregate never includes browser IDs, IPs, emails, URLs, query strings,
referrers or other customer data. The dashboard copies only validated aggregate
metrics and coverage state into its result.

`capture_started_at` records the start of measurement, even when there are no
page views. Before that timestamp, the dashboard shows unavailable metrics.
When an interval overlaps the start of measurement, it labels the totals as a
partial period and identifies when measurement began. Connected, fully measured
empty intervals show zero visitors and page views; an absent source shows dashes.
A disabled collector returns a null capture start and makes all displayed metrics
unavailable, including when its raw response contains zeros.

The optional `limited_events` field must be a nonnegative safe integer and
`capture_limited` must be a boolean when present. Either a positive limit signal
or a true capture-limited flag marks the totals as incomplete. This covers capture
limits and pauses/re-enabled measurement gaps. Accepted counts remain visible,
with a coverage warning. Limit counters can overlap hourly bucket boundaries;
they are qualitative coverage signals, not exact numbers of dropped page views.
The UI does not display those counters. Periods before measurement started remain
unavailable even when coverage warnings are present.

## Connection requirement

The protected aggregate must be installed in the separate commerce database and
the consent-aware storefront collector must be enabled before real traffic totals
are available. Deployment must record the actual start of measurement. Historical
traffic before that point is unavailable and is not backfilled from checkout
events, tasting statistics or commerce customer counts.

The existing `requireStaff` check excludes anonymous users/customers and redirects
hosts before any store read. `authorizedCommerceClient` binds the store session to
the tasting administrator and verifies the commerce administrator role. The summary
RPC must enforce administrator access independently. This dashboard change does
not change those authorization boundaries or add service credentials to the UI.
If the function is absent, disabled, unavailable, denied or returns inconsistent
data, the section does not fabricate counts.
