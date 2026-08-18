"use client";

import {useState} from "react";
import {DiscoveryEmblem} from "@/components/dashboard/DiscoveryEmblem";
import {formatIdentityEarnedDate,type DiscoveryIdentity,type DiscoveryProfileSnapshot} from "@/lib/discovery-identity";

export function DiscoveryProfile({initialSnapshot}:{initialSnapshot:DiscoveryProfileSnapshot}){
  const[snapshot,setSnapshot]=useState(initialSnapshot);
  const[busyId,setBusyId]=useState<string|null>(null);
  const[error,setError]=useState("");
  const visible=snapshot.identities.filter(identity=>!identity.hidden);
  const hidden=snapshot.identities.filter(identity=>identity.hidden);
  const featuredCount=visible.filter(identity=>identity.featured).length;

  async function updateIdentity(identity:DiscoveryIdentity,action:"feature"|"hide"|"restore"){
    setBusyId(identity.id);setError("");
    try{
      const response=await fetch("/api/discovery-profile",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"set_identity_preferences",identityId:identity.id,featured:action==="feature"?!identity.featured:false,hidden:action==="hide"})
      });
      const result=await response.json() as {snapshot?:DiscoveryProfileSnapshot;error?:string};
      if(!response.ok||!result.snapshot)throw new Error(result.error??"That identity preference could not be saved.");
      setSnapshot(result.snapshot);
    }catch(actionError){setError(actionError instanceof Error?actionError.message:"That identity preference could not be saved.")}
    finally{setBusyId(null)}
  }

  async function setReveals(enabled:boolean){
    setBusyId("reveals");setError("");
    try{
      const response=await fetch("/api/discovery-profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"set_reveals",enabled})});
      const result=await response.json() as {snapshot?:DiscoveryProfileSnapshot;error?:string};
      if(!response.ok||!result.snapshot)throw new Error(result.error??"That reveal preference could not be saved.");
      setSnapshot(result.snapshot);
    }catch(actionError){setError(actionError instanceof Error?actionError.message:"That reveal preference could not be saved.")}
    finally{setBusyId(null)}
  }

  if(!snapshot.available)return <section className="discovery-profile discovery-profile-unavailable" aria-labelledby="discovery-title">
    <div className="discovery-profile-hero"><div><p className="eyebrow">Private discovery profile</p><h1 id="discovery-title">Your tea journey is still yours.</h1><p>The identity service is quietly unavailable. Your tastings and Tea Cellar continue to work normally.</p></div></div>
  </section>;

  return <section className="discovery-profile" aria-labelledby="discovery-title">
    <header className="discovery-profile-hero">
      <div><p className="eyebrow">Private discovery profile</p><h1 id="discovery-title">The shape of your tea journey</h1><p>Patterns in what you have explored—not a score for how “good” your palate is.</p></div>
      <div className="discovery-private-seal"><span aria-hidden="true">⌁</span><strong>Account-only</strong><small>Nothing here appears in tasting rooms.</small></div>
    </header>
    <div className="discovery-metrics" aria-label="Your discovery history">
      <Metric value={snapshot.metrics.teasExplored} label="teas explored"/>
      <Metric value={snapshot.metrics.teaTypeCount} label="tea types"/>
      <Metric value={snapshot.metrics.originCount} label="origins"/>
      <Metric value={snapshot.metrics.liveTastingsCompleted} label="live tastings"/>
    </div>
    <div className="discovery-section-heading"><div><p className="eyebrow">Field-journal collection</p><h2>Your discovery identities</h2></div><p>Feature up to two at the top of this private profile.</p></div>
    {error&&<p className="notice notice-error" role="alert">{error}</p>}
    {visible.length?<div className="discovery-identity-grid">{visible.map(identity=><IdentityCard key={identity.id} identity={identity} busy={busyId===identity.id} featureDisabled={!identity.featured&&featuredCount>=2} onAction={action=>void updateIdentity(identity,action)}/>)}</div>
      :<div className="empty-state discovery-empty"><DiscoveryEmblem kind="compass"/><h2>Your first pages are waiting.</h2><p>Completed tasting cards gradually reveal warm, non-hierarchical patterns in the teas you explore.</p><a className="btn btn-secondary" href="/dashboard?section=journal">Open your Tasting Journal</a></div>}
    {hidden.length>0&&<details className="discovery-hidden card"><summary>Hidden identities ({hidden.length})</summary><div className="discovery-hidden-list">{hidden.map(identity=><div key={identity.id}><DiscoveryEmblem kind={identity.emblem}/><span><strong>{identity.name}</strong><small>Still part of your private history.</small></span><button className="btn btn-secondary" disabled={busyId===identity.id} onClick={()=>void updateIdentity(identity,"restore")}>Restore</button></div>)}</div></details>}
    <section className="discovery-preferences card" aria-labelledby="discovery-preferences-title">
      <div><p className="eyebrow">Privacy &amp; timing</p><h2 id="discovery-preferences-title">Reveal preferences</h2><p>New identities can appear after a completed tasting. They never interrupt First Sip, group Reveal, Cheers, or someone speaking.</p></div>
      <button className="btn btn-secondary" type="button" aria-pressed={snapshot.identityRevealsEnabled} disabled={busyId==="reveals"} onClick={()=>void setReveals(!snapshot.identityRevealsEnabled)}>{snapshot.identityRevealsEnabled?"Post-tasting reveals on":"Post-tasting reveals off"}</button>
    </section>
    <section className="discovery-formal-section card" aria-labelledby="formal-learning-title"><div className="discovery-formal-mark" aria-hidden="true">VF</div><div><p className="eyebrow">Separate formal pathway</p><h2 id="formal-learning-title">Learning &amp; certification</h2><p>Discovery identities are playful records of curiosity. They are not Tea Practitioner, Tea Expert, Sommelier, or accredited credentials.</p><small>No formal credential is connected to this account yet.</small></div></section>
  </section>;
}

function Metric({value,label}:{value:number;label:string}){return <div><strong>{value}</strong><span>{label}</span></div>}

function IdentityCard({identity,busy,featureDisabled,onAction}:{identity:DiscoveryIdentity;busy:boolean;featureDisabled:boolean;onAction:(action:"feature"|"hide")=>void}){
  return <article className={`discovery-identity-card ${identity.featured?"is-featured":""}`}>
    <header><DiscoveryEmblem kind={identity.emblem}/><div><p className="eyebrow">{identity.featured?"Featured discovery":"Discovery identity"}</p><h3>{identity.name}</h3></div></header>
    <p className="discovery-identity-description">{identity.description}</p>
    <div className="discovery-evidence"><strong>Why you earned this</strong><p>{identity.evidenceSummary}</p>{!identity.currentlyConfirmed&&<p className="help">This remains in your collection; corrected history changed its current contributing evidence.</p>}</div>
    {identity.relatedTeas.length>0&&<div className="discovery-related-teas"><strong>Contributing tasting cards</strong><ul>{identity.relatedTeas.slice(0,4).map(tea=><li key={`${identity.id}:${tea.teaKey}`}><span>{tea.teaName}</span>{tea.origin&&<small>{tea.origin}</small>}</li>)}</ul><a href="/dashboard?section=journal">Open your Tasting Journal</a></div>}
    <footer><span>First earned <time dateTime={identity.earnedAt}>{formatIdentityEarnedDate(identity.earnedAt)}</time></span><div><button className="btn btn-secondary" type="button" disabled={busy||featureDisabled} title={featureDisabled?"You can feature up to two identities.":undefined} aria-pressed={identity.featured} onClick={()=>onAction("feature")}>{identity.featured?"Unfeature":"Feature"}</button><button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>onAction("hide")}>Hide</button></div></footer>
  </article>;
}
