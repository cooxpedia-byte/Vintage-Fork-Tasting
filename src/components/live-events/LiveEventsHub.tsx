"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { MobileHomeBridge } from "@/components/live-events/MobileHomeBridge";
import { formatCustomerEventDateTime } from "@/lib/customer-dashboard";
import { guestEventPath } from "@/lib/live-events-routes";

export type LiveEventsHubEvent = {
  id: string;
  title: string;
  startsAt: string;
  timezone: string | null;
  locationMode: string;
  status: string;
  inviteCode: string | null;
  venueName: string | null;
};

export function LiveEventsHub({ events }: { events: LiveEventsHubEvent[] }) {
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const live = events.filter(event => event.status === "live");
  const upcoming = events.filter(event => event.status === "scheduled");

  function openInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      window.location.assign(guestEventPath(inviteCode));
    } catch {
      setInviteError("Enter the invitation code from your Vintage Fork event.");
    }
  }

  return <main className="live-events-hub" id="main-content">
    <section className="live-events-hero">
      <div>
        <p className="eyebrow">Your shared tea table</p>
        <h1 className="page-title">Live Events</h1>
        <p className="page-lede">Join the salon, follow the synchronized tea flight, and keep your private tasting notes close at hand.</p>
      </div>
      <MobileHomeBridge />
    </section>

    {live.length > 0 && <section aria-labelledby="live-now-heading">
      <div className="section-label"><span id="live-now-heading">Live now</span></div>
      <div className="stack">{live.map(event => <LiveEventCard event={event} live key={event.id} />)}</div>
    </section>}

    <section aria-labelledby="upcoming-heading">
      <div className="section-label"><span id="upcoming-heading">Upcoming tastings</span></div>
      {upcoming.length > 0
        ? <div className="live-events-grid">{upcoming.map(event => <LiveEventCard event={event} key={event.id} />)}</div>
        : <div className="empty-state"><h2>No upcoming tastings are linked yet.</h2><p>Use an invitation code below, or return when your next Vintage Fork table is booked.</p></div>}
    </section>

    <section className="card live-events-invite" aria-labelledby="invitation-heading">
      <div>
        <p className="eyebrow">Have an invitation?</p>
        <h2 className="card-title" id="invitation-heading">Open your tasting room</h2>
        <p className="muted">Invitation links still work in any browser. Mobile Home is simply the primary in-app entry.</p>
      </div>
      <form onSubmit={openInvitation}>
        <label htmlFor="live-event-invite">Invitation code</label>
        <div className="row">
          <input
            className="input"
            id="live-event-invite"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={24}
            value={inviteCode}
            onChange={event => {
              setInviteCode(event.target.value.toUpperCase());
              setInviteError("");
            }}
          />
          <button className="btn btn-primary btn-attention" type="submit">Open event</button>
        </div>
        {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
      </form>
    </section>
  </main>;
}

function LiveEventCard({ event, live = false }: { event: LiveEventsHubEvent; live?: boolean }) {
  const roomPath = event.inviteCode ? guestEventPath(event.inviteCode) : null;
  return <article className={`card live-event-card ${live ? "is-live" : ""}`}>
    <div className="card-header">
      <div>
        <p className="eyebrow">{live ? "Live now" : formatCustomerEventDateTime(event.startsAt, event.timezone)}</p>
        <h2 className="card-title">{event.title}</h2>
        <p className="card-meta">{event.locationMode === "remote" ? "Online tea salon" : event.venueName || "In-person tasting"}</p>
      </div>
      <span className={`chip ${live ? "chip-live" : "chip-success"}`}>{live ? "Live" : "Booked"}</span>
    </div>
    <p>{live ? "Your host has opened the table. Join to see the current tea, synchronized brewing guidance, and tasting activities." : "Your seat is linked to this account. The room will keep the event, flight, and your private tasting record together."}</p>
    <div className="card-footer">
      <span>{event.locationMode === "remote" ? "Video room and tea flight" : "Tea flight and companion guide"}</span>
      {roomPath ? <Link className="btn btn-primary btn-attention" href={roomPath}>{live ? "Join live room" : "Open event"}</Link> : <span className="muted">Invitation pending</span>}
    </div>
  </article>;
}
