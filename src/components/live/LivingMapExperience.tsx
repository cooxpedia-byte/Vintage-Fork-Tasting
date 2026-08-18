"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/browser";
import {LivingTastingMap} from "@/components/live/LivingTastingMap";
import {TEA_DESCRIPTOR_PALETTE} from "@/lib/tea-lab/descriptors";
import {
  LIVING_MAP_FAMILIES,LIVING_MAP_PROMPTS,livingMapElapsedMs,livingMapFamily,livingMapFlavorKey,livingMapReplayPositionMs,livingMapReplayProjection,
  type LivingMapFamily,type LivingMapLayer,type LivingMapSnapshot
} from "@/lib/living-tasting-map";
import type {ConductorStage} from "@/types/domain";

type Selection={label:string;key:string;family:LivingMapFamily;isCustom:boolean;intensity:number};

export function LivingMapExperience({eventId,stage}:{eventId:string;stage:ConductorStage}){
  const[snapshot,setSnapshot]=useState<LivingMapSnapshot|null>(null);const[layer,setLayer]=useState<LivingMapLayer>(stage==="aroma"?"aroma":"taste");
  const[family,setFamily]=useState<LivingMapFamily>("floral");const[query,setQuery]=useState("");const[custom,setCustom]=useState("");
  const[selection,setSelection]=useState<Selection|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState("");const[now,setNow]=useState<number|null>(null);
  const sequence=useRef(0);const reducedMotion=useReducedMotion();
  const refresh=useCallback(async()=>{const response=await fetch(`/api/events/${eventId}/living-map`,{cache:"no-store"});if(!response.ok)return;const result=await response.json() as {snapshot:LivingMapSnapshot|null};setSnapshot(result.snapshot)},[eventId]);

  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),0);const poll=window.setInterval(()=>void refresh(),3000);return()=>{window.clearTimeout(timer);window.clearInterval(poll)}},[refresh]);
  useEffect(()=>{const client=createClient();const channel=client.channel(`living-map-${eventId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"living_tasting_map_snapshots",filter:`event_id=eq.${eventId}`},()=>void refresh()).subscribe();return()=>{void client.removeChannel(channel)}},[eventId,refresh]);
  useEffect(()=>{if(!snapshot?.session.startedAt)return;const first=window.setTimeout(()=>setNow(Date.now()),0);const timer=window.setInterval(()=>setNow(Date.now()),250);return()=>{window.clearTimeout(first);window.clearInterval(timer)}},[snapshot?.session.startedAt]);

  const elapsed=snapshot?livingMapElapsedMs(snapshot.session,now??0):0;
  const replayPosition=snapshot?livingMapReplayPositionMs(snapshot.session,now??0):0;
  const projection=snapshot?.replay&&snapshot.session.status==="replaying"
    ?livingMapReplayProjection(snapshot.replay.events,snapshot.projection.participantTotal,replayPosition)
    :snapshot?.projection??null;
  const prompt=[...LIVING_MAP_PROMPTS].reverse().find(candidate=>candidate.atMs<=elapsed)?.label??LIVING_MAP_PROMPTS[0].label;
  const options=useMemo(()=>TEA_DESCRIPTOR_PALETTE.map(descriptor=>({...descriptor,family:livingMapFamily(descriptor.label)})).filter(descriptor=>descriptor.family===family&&(query?`${descriptor.label} ${descriptor.aliases.join(" ")}`.toLocaleLowerCase("en-CA").includes(query.toLocaleLowerCase("en-CA")):true)).slice(0,18),[family,query]);
  const own=snapshot?.viewerObservations??[];const selectedExisting=selection?own.find(item=>item.layer===layer&&item.flavorKey===selection.key):null;

  const record=useCallback(async(operation:"add"|"update"|"remove",target:Selection,activeLayer:LivingMapLayer)=>{
    setBusy(true);setError("");try{const response=await fetch(`/api/events/${eventId}/living-map`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"record_observation",operation,layer:activeLayer,flavorLabel:target.label,family:target.family,isCustom:target.isCustom,intensity:target.intensity,clientSequence:sequence.current++,clientId:crypto.randomUUID()})});const result=await response.json() as {snapshot?:LivingMapSnapshot;error?:string};if(!response.ok){setError(result.error??"That observation could not be added.");return}if(result.snapshot)setSnapshot(result.snapshot)}catch{setError("The connection shifted. Your map is unchanged; try once more when it settles.")}finally{setBusy(false)}
  },[eventId]);

  function choose(label:string,targetFamily:LivingMapFamily,isCustom:boolean){const key=livingMapFlavorKey(label);const existing=own.find(item=>item.layer===layer&&item.flavorKey===key);setSelection({label,key,family:targetFamily,isCustom,intensity:existing?.intensity??50})}
  function addCustom(){const label=custom.replace(/\s+/g," ").trim();if(!label)return;choose(label,family,true)}

  if(!snapshot)return <section className="living-map-shell card"><p className="eyebrow">Signature experience</p><h2 className="card-title">The Living Tasting Map</h2><p>The map will open with the host during Aroma.</p></section>;
  const editable=snapshot.session.status==="live";
  return <section className={`living-map-shell living-map-status-${snapshot.session.status}`} aria-labelledby="living-map-experience-title">
    <header className="living-map-heading"><div><p className="eyebrow">Signature experience · anonymous group portrait</p><h2 id="living-map-experience-title">The Living Tasting Map</h2><p>{prompt}</p></div><div className="living-map-clock" role="timer" aria-label={`${formatClock(Math.max(0,snapshot.session.durationSeconds*1000-elapsed))} remaining`}><strong>{formatClock(Math.max(0,snapshot.session.durationSeconds*1000-elapsed))}</strong><span>{snapshot.session.status==="paused"?"paused":snapshot.session.status==="replaying"?"replaying":"remaining"}</span></div></header>
    {projection&&<LivingTastingMap projection={projection} groupVisible={snapshot.session.status==="replaying"||snapshot.session.status==="frozen"||snapshot.session.status==="committed"?true:snapshot.groupVisible} reducedMotion={reducedMotion}/>}
    {snapshot.session.status==="replaying"&&<ReplayProgress positionMs={replayPosition} durationMs={snapshot.session.durationSeconds*1000} markers={snapshot.replay?.promptMarkersMs??[]}/>}
    {snapshot.generatedPatterns.length>0&&<div className="living-map-patterns"><strong>What emerged</strong><ul>{snapshot.generatedPatterns.map(pattern=><li key={pattern}>{pattern}</li>)}</ul></div>}
    {editable&&<div className="living-map-input">
      <div className="living-map-input-heading"><div><p className="eyebrow">Your observation · visible without your name</p><h3>What are you noticing?</h3></div><div className="living-map-sense" role="group" aria-label="Observation layer"><button type="button" className={layer==="aroma"?"active aroma":"aroma"} aria-pressed={layer==="aroma"} onClick={()=>{setLayer("aroma");setSelection(null)}}>◎ Aroma</button><button type="button" className={layer==="taste"?"active taste":"taste"} aria-pressed={layer==="taste"} onClick={()=>{setLayer("taste");setSelection(null)}}>● Taste</button></div></div>
      <div className="living-map-input-grid"><section className="living-map-vocabulary" aria-label="Flavor vocabulary"><label className="sr-only" htmlFor={`living-map-search-${eventId}`}>Search flavor vocabulary</label><input id={`living-map-search-${eventId}`} className="input" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search the vocabulary…"/>
        <div className="living-map-families" aria-label="Flavor families">{LIVING_MAP_FAMILIES.map(value=><button type="button" className={family===value?"active":""} aria-pressed={family===value} key={value} onClick={()=>{setFamily(value);setQuery("")}}>{value}</button>)}</div>
        <div className="living-map-words">{options.map(option=><button type="button" className={selection?.key===option.slug?"active":""} key={option.id} onClick={()=>choose(option.label,option.family,false)}>{option.label}</button>)}</div>
        {snapshot.session.customNotesEnabled&&<div className="living-map-custom"><label htmlFor={`living-map-custom-${eventId}`}>Add my own words</label><div className="row"><input id={`living-map-custom-${eventId}`} className="input" maxLength={80} value={custom} onChange={event=>setCustom(event.target.value)} placeholder="Rain on stone…"/><button className="btn btn-secondary" type="button" disabled={!custom.trim()} onClick={addCustom}>Use phrase</button></div></div>}
      </section>
      <section className="living-map-intensity" aria-live="polite">{selection?<><p className="eyebrow">{layer} · {selection.family}</p><h3>{selection.label}</h3><label htmlFor={`living-map-intensity-${eventId}`}>How strongly is it present?</label><output htmlFor={`living-map-intensity-${eventId}`}>{selection.intensity}°</output><input id={`living-map-intensity-${eventId}`} type="range" min={0} max={100} step={1} value={selection.intensity} onChange={event=>setSelection(current=>current?{...current,intensity:Number(event.target.value)}:current)} aria-valuetext={`${selection.intensity} degrees, ${intensityLabel(selection.intensity)}`}/><div className="living-map-intensity-controls"><button type="button" aria-label="Decrease intensity by five" onClick={()=>setSelection(current=>current?{...current,intensity:Math.max(0,current.intensity-5)}:current)}>−</button><input type="number" min={0} max={100} value={selection.intensity} aria-label="Intensity from 0 to 100 degrees" onChange={event=>setSelection(current=>current?{...current,intensity:Math.max(0,Math.min(100,Number(event.target.value)))}:current)}/><button type="button" aria-label="Increase intensity by five" onClick={()=>setSelection(current=>current?{...current,intensity:Math.min(100,current.intensity+5)}:current)}>+</button></div><div className="living-map-scale"><span>0° · not present</span><span>50° · clearly present</span><span>100° · unmistakable</span></div><div className="guest-actions"><button className="btn btn-primary btn-attention" type="button" disabled={busy} onClick={()=>void record(selectedExisting?"update":"add",selection,layer)}>{busy?"Adding…":selectedExisting?"Update observation":"Add observation"}</button>{selectedExisting&&<button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>void record("remove",selection,layer)}>Remove observation</button>}</div></>:<div className="living-map-selection-empty"><span aria-hidden="true">⌁</span><strong>Choose a word or add your own phrase.</strong><p>The vocabulary is a tool, never a list of expected notes.</p></div>}</section></div>
      {error&&<div className="notice error" role="alert">{error}</div>}
      <div className="living-map-own"><strong>My current observations</strong>{own.length?<div>{own.map(item=><button type="button" key={`${item.layer}:${item.flavorKey}`} onClick={()=>{setLayer(item.layer);setSelection({label:item.flavorLabel,key:item.flavorKey,family:item.family,isCustom:item.isCustom,intensity:item.intensity})}}><span>{item.layer==="aroma"?"◎":"●"}</span>{item.flavorLabel}<small>{item.intensity}°</small></button>)}</div>:<p>Nothing here yet. Notice what comes first.</p>}</div>
    </div>}
    {snapshot.session.status==="paused"&&<div className="notice"><strong>The host paused the map.</strong> Your observations are safe and the room can stay with the cup.</div>}
    {snapshot.session.status==="frozen"&&<div className="notice success"><strong>The ending is frozen.</strong> The host can now replay how the tasting changed.</div>}
    {snapshot.session.status==="committed"&&<div className="notice success"><strong>Tasting Fingerprint saved.</strong> This is what this room experienced today.</div>}
  </section>;
}

function ReplayProgress({positionMs,durationMs,markers}:{positionMs:number;durationMs:number;markers:number[]}){return <div className="living-map-replay-progress"><div><i style={{width:`${Math.min(100,positionMs/durationMs*100)}%`}}/>{markers.map(marker=><span key={marker} style={{left:`${marker/durationMs*100}%`}}/>)}</div><strong>{formatClock(positionMs)} / {formatClock(durationMs)}</strong></div>}
function intensityLabel(value:number){return value===0?"not present":value<35?"faint":value<70?"clearly present":"unmistakable"}
function formatClock(ms:number){const seconds=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`}
function useReducedMotion(){const[value,setValue]=useState(false);useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const sync=()=>setValue(media.matches);sync();media.addEventListener?.("change",sync);return()=>media.removeEventListener?.("change",sync)},[]);return value}
