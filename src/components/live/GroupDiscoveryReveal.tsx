"use client";

import { revealStateShows, sensoryKey, type GroupRevealSnapshot, type RevealAggregateItem, type RevealLayer } from "@/lib/group-reveal";
import { DISCOVERY_FIRST_COPY } from "@/lib/discovery-first";

export function GroupDiscoveryReveal({ snapshot, teaName, producerNote, presentation = "guest", onHighlight }: {
  snapshot: GroupRevealSnapshot;
  teaName: string;
  producerNote?: string | null;
  presentation?: "guest" | "host";
  onHighlight?: (key: string | null) => void;
}) {
  if (snapshot.state === "hidden") return <section className="group-reveal group-reveal-hidden" aria-labelledby="group-reveal-title">
    <p className="eyebrow">Gather · observations stay private</p>
    <h2 id="group-reveal-title">The group portrait is still covered.</h2>
    <p>Independent observations remain hidden until the host opens the reveal. Contribution coverage never exposes what anyone wrote.</p>
    <Coverage snapshot={snapshot} />
  </section>;
  const showAroma = revealStateShows(snapshot.state, "aroma") && snapshot.aroma;
  const showTaste = revealStateShows(snapshot.state, "taste") && snapshot.taste;
  const combined = ["combined", "timeline", "fingerprint"].includes(snapshot.state);
  return <section className={`group-reveal group-reveal-${snapshot.state}`} aria-labelledby="group-reveal-title">
    <span className="sr-only" role="status" aria-live="polite">Group reveal: {snapshot.state}. {snapshot.highlightedFlavor?`Highlighted flavor ${snapshot.highlightedFlavor}.`:""}</span>
    <div className="group-reveal-heading"><div><p className="eyebrow">Our tasting · {teaName}</p><h2 id="group-reveal-title">What emerged</h2><p>Patterns without grading. Breadth shows how widely something appeared; heat shows its reported strength.</p></div><span className="chip">{snapshot.coverage.participantCount} people</span></div>
    {snapshot.coverage.postRevealEntries>0&&<div className="notice"><strong>{snapshot.coverage.postRevealEntries} later observation{snapshot.coverage.postRevealEntries===1?"":"s"}</strong> arrived after the reveal began and remain timestamped as post-reveal.</div>}
    <Coverage snapshot={snapshot} />
    <div className={`group-reveal-layers${combined?" combined":""}`}>
      {showAroma&&<RevealLayerView layer={showAroma} marker="A" highlightedFlavor={snapshot.highlightedFlavor} onHighlight={onHighlight}/>}
      {showTaste&&<RevealLayerView layer={showTaste} marker="T" highlightedFlavor={snapshot.highlightedFlavor} onHighlight={onHighlight}/>}
    </div>
    {combined&&<section className="group-reveal-overlap" aria-labelledby="group-overlap-title"><h3 id="group-overlap-title">Aroma × taste overlap</h3><p className="help">Cross-hatching and A/T labels distinguish overlap without relying on color.</p>{snapshot.overlap.length?<ul>{snapshot.overlap.map(item=><li key={item.key}><button type="button" disabled={!onHighlight} className={snapshot.highlightedFlavor===item.key?"active":""} onClick={()=>onHighlight?.(snapshot.highlightedFlavor===item.key?null:item.key)}><span aria-hidden="true">A×T</span><strong>{item.label}</strong><small>{item.aromaCount} aroma · {item.tasteCount} taste</small></button></li>)}</ul>:<p className="empty-state">Aroma and taste remained different in this tasting.</p>}</section>}
    {snapshot.roomCards.length>0&&<section className="group-reveal-rooms" aria-labelledby="group-rooms-title"><h3 id="group-rooms-title">What the tables carried back</h3><div className="group-reveal-room-grid">{snapshot.roomCards.map(card=><article className="card" key={card.id}><span className="eyebrow">Table {card.roomNumber}</span><strong>{card.flavors.join(" · ")||"A different table portrait"}</strong>{card.curiosity&&<p>{card.curiosity}</p>}<small>{card.participantCount} people · anonymous summary</small></article>)}</div></section>}
    {snapshot.state==="timeline"&&<Timeline snapshot={snapshot}/>}
    {snapshot.state==="fingerprint"&&<section className="group-reveal-fingerprint" aria-labelledby="fingerprint-title"><p className="eyebrow">Saved group artifact · version {snapshot.fingerprintVersion}</p><h3 id="fingerprint-title">{DISCOVERY_FIRST_COPY.fingerprint}</h3><p>It keeps the tea and brew context, anonymous aggregates, room cards, and the observation timeline together.</p>{snapshot.frozenAt&&<small>Saved {new Date(snapshot.frozenAt).toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"})}</small>}</section>}
    {snapshot.privateComparison&&<PrivateComparison snapshot={snapshot}/>}
    {snapshot.producerNotesVisible&&<section className="group-reveal-producer" aria-labelledby="producer-note-title"><p className="eyebrow">Producer / host context · separate source</p><h3 id="producer-note-title">{DISCOVERY_FIRST_COPY.producerContext}</h3><p>{producerNote||"No separate producer note was added for this tea."}</p><small>This is one sourced perspective for comparison. It does not grade or replace the group portrait.</small></section>}
    {presentation==="guest"&&<p className="help group-reveal-privacy">All group patterns are anonymous. Unique observations are shown without identity, and small-group details are limited.</p>}
  </section>;
}

function Coverage({snapshot}:{snapshot:GroupRevealSnapshot}) {
  return <dl className="group-reveal-coverage"><div><dt>Aroma gathered</dt><dd>{snapshot.coverage.aromaContributors} / {snapshot.coverage.participantCount}</dd></div><div><dt>Taste gathered</dt><dd>{snapshot.coverage.tasteContributors} / {snapshot.coverage.participantCount}</dd></div><div><dt>Table cards</dt><dd>{snapshot.coverage.roomCardCount}</dd></div></dl>;
}

function RevealLayerView({layer,marker,highlightedFlavor,onHighlight}:{layer:RevealLayer;marker:"A"|"T";highlightedFlavor:string|null;onHighlight?: (key:string|null)=>void}) {
  return <section className={`group-reveal-layer group-reveal-layer-${layer.modality}`} aria-labelledby={`group-layer-${layer.modality}`}><div className="group-reveal-layer-title"><span aria-hidden="true">{marker}</span><div><h3 id={`group-layer-${layer.modality}`}>{layer.modality === "aroma" ? "Aroma portrait" : "Taste portrait"}</h3><small>{layer.contributionCount} contributions</small></div></div>{layer.items.length?<ul className="group-reveal-flavors">{layer.items.map(item=><FlavorItem key={item.key} item={item} marker={marker} active={highlightedFlavor===item.key} onHighlight={onHighlight}/>)}</ul>:<div className="empty-state"><strong>{DISCOVERY_FIRST_COPY.emptyObservation}</strong><p>This part of the group portrait is still open.</p></div>}</section>;
}

function FlavorItem({item,marker,active,onHighlight}:{item:RevealAggregateItem;marker:"A"|"T";active:boolean;onHighlight?: (key:string|null)=>void}) {
  return <li className={active?"active":""} style={{"--breadth":`${item.breadth}%`,"--heat":item.heat/100} as React.CSSProperties}><button type="button" disabled={!onHighlight} aria-pressed={active} onClick={()=>onHighlight?.(active?null:item.key)}><span className="group-reveal-marker" aria-hidden="true">{marker}</span><span><strong>{item.label}</strong><small>{item.strengthLabel}</small></span><span className="group-reveal-meter" aria-hidden="true"><i /></span></button><details><summary>Pattern details</summary>{item.detailsSuppressed?<p>Small group · detailed counts are limited.</p>:<p>{item.participantCount} of {item.participantTotal} people · average intensity {item.averageIntensity} · median {item.medianIntensity}</p>}</details></li>;
}

function Timeline({snapshot}:{snapshot:GroupRevealSnapshot}) {
  const active=snapshot.timelineIndex===null?snapshot.timeline.length-1:snapshot.timelineIndex;
  return <section className="group-reveal-timeline" aria-labelledby="group-timeline-title"><h3 id="group-timeline-title">How the tasting unfolded</h3>{snapshot.timeline.length?<ol>{snapshot.timeline.map((event,index)=><li className={index===active?"active":""} key={event.id}><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString("en-CA",{hour:"numeric",minute:"2-digit"})}</time><div><strong>{event.label}</strong><span>{event.detail}{event.postReveal?" · post-reveal":""}</span></div></li>)}</ol>:<p className="empty-state">The structured timeline is still gathering.</p>}</section>;
}

function PrivateComparison({snapshot}:{snapshot:GroupRevealSnapshot}) {
  const comparison=snapshot.privateComparison!;
  return <details className="group-reveal-private"><summary>My Tasting / Our Tasting</summary><div className="grid grid-2"><div><strong>Aroma</strong><p>Shared with the room: {comparison.aroma.shared.join(" · ")||"None yet"}</p><p>Personal to your card: {comparison.aroma.personal.join(" · ")||"None yet"}</p></div><div><strong>Taste</strong><p>Shared with the room: {comparison.taste.shared.join(" · ")||"None yet"}</p><p>Personal to your card: {comparison.taste.personal.join(" · ")||"None yet"}</p></div></div></details>;
}

export function flavorMentionedByRooms(snapshot:GroupRevealSnapshot,flavorKey:string){
  return snapshot.roomCards.filter(card=>card.flavors.some(flavor=>sensoryKey(flavor)===flavorKey)).map(card=>card.roomNumber);
}
