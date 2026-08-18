"use client";

import {useMemo,useState} from "react";
import {LIVING_MAP_FAMILIES,type LivingMapAggregateItem,type LivingMapProjection} from "@/lib/living-tasting-map";

export function LivingTastingMap({projection,groupVisible=true,reducedMotion=false,ariaLabel="The room’s Living Tasting Map"}:{projection:LivingMapProjection;groupVisible?:boolean;reducedMotion?:boolean;ariaLabel?:string}){
  const[aromaVisible,setAromaVisible]=useState(true);const[tasteVisible,setTasteVisible]=useState(true);const[selected,setSelected]=useState<string|null>(null);
  const visible=useMemo(()=>projection.items.filter(item=>(item.layer==="aroma"?aromaVisible:tasteVisible)),[aromaVisible,projection.items,tasteVisible]);
  const overlapItems=useMemo(()=>{
    if(!aromaVisible||!tasteVisible)return[];
    const byKey=new Map<string,LivingMapAggregateItem[]>();
    for(const item of visible)byKey.set(item.key,[...(byKey.get(item.key)??[]),item]);
    return[...byKey.values()].filter(items=>items.some(item=>item.layer==="aroma")&&items.some(item=>item.layer==="taste")).map(items=>items.reduce((largest,item)=>item.radius>largest.radius?item:largest));
  },[aromaVisible,tasteVisible,visible]);
  const selectedItem=visible.find(item=>`${item.layer}:${item.key}`===selected)??null;
  return <section className={`living-map ${reducedMotion?"reduced-motion":""}`} aria-label={ariaLabel}>
    <div className="living-map-toolbar" aria-label="Map layers">
      <button className={`living-map-layer aroma ${aromaVisible?"active":""}`} type="button" aria-pressed={aromaVisible} onClick={()=>setAromaVisible(value=>!value)}><span aria-hidden="true">◎</span> Aroma</button>
      <button className={`living-map-layer taste ${tasteVisible?"active":""}`} type="button" aria-pressed={tasteVisible} onClick={()=>setTasteVisible(value=>!value)}><span aria-hidden="true">●</span> Taste</button>
      <span className="spacer"/><span className="help">Size = people · brightness = intensity · softness = variation</span>
    </div>
    {!groupVisible?<div className="living-map-quiet" role="status"><span aria-hidden="true">◌</span><strong>Notice privately for a moment.</strong><p>Your observations are joining the map. The room portrait will fade in shortly.</p></div>
    :visible.length?<><svg className="living-map-canvas" viewBox="0 0 1000 700" role="img" aria-labelledby="living-map-title living-map-description">
      <title id="living-map-title">Anonymous aroma and taste landscape</title><desc id="living-map-description">{mapSummary(projection)}</desc>
      <defs><pattern id="living-map-overlap-pattern" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="rgba(110,44,106,.35)" strokeWidth="4"/></pattern></defs>
      <ellipse className="living-map-field" cx="500" cy="330" rx="390" ry="270"/>
      {LIVING_MAP_FAMILIES.map((family,index)=><FamilyLabel family={family} index={index} key={family}/>) }
      {[...visible].sort((left,right)=>Number(left.layer==="taste")-Number(right.layer==="taste")).map(item=><MapBlob item={item} key={`${item.layer}:${item.key}`} selected={selected===`${item.layer}:${item.key}`} onSelect={()=>setSelected(current=>current===`${item.layer}:${item.key}`?null:`${item.layer}:${item.key}`)}/>) }
      {overlapItems.map(item=><OverlapMarker item={item} key={`overlap:${item.key}`}/>) }
      <g className="living-map-centre"><rect x="382" y="296" width="236" height="72" rx="18"/><text x="500" y="325" textAnchor="middle">THE ROOM’S LIVING MAP</text><text x="500" y="349" textAnchor="middle">patterns without grading</text></g>
    </svg>
    <div className="sr-only"><ul>{visible.map(item=><li key={`${item.layer}:${item.key}`}>{item.label}, {item.layer}, {item.participantCount===null?"a small group":`${item.participantCount} of ${item.participantTotal} people`}, average intensity {item.averageIntensity} degrees, variation {item.intensitySpread}.</li>)}</ul></div></>
    :<div className="living-map-empty"><strong>Nothing here yet. Notice what comes first.</strong><p>The portrait will grow as people add Aroma and Taste observations.</p></div>}
    {selectedItem&&<article className={`living-map-detail ${selectedItem.layer}`} aria-live="polite"><span className="eyebrow">{selectedItem.layer} · {selectedItem.family}</span><strong>{selectedItem.label}</strong><span>{selectedItem.participantCount===null?"Small group · detailed counts are limited":`${selectedItem.participantCount} of ${selectedItem.participantTotal} people`} · {selectedItem.averageIntensity}° average · {spreadLabel(selectedItem.intensitySpread)}</span></article>}
  </section>;
}

function MapBlob({item,selected,onSelect}:{item:LivingMapAggregateItem;selected:boolean;onSelect:()=>void}){
  const x=item.x*10,y=20+item.y*6.15,r=item.radius*1.45;const brightness=.22+item.averageIntensity/155;
  return <g className={`living-map-blob ${item.layer}${item.recentlyChanged?" recent":""}${selected?" selected":""}`} role="button" tabIndex={0} aria-label={`${item.label}, ${item.layer}, average intensity ${item.averageIntensity} degrees`} onClick={onSelect} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect()}}}>
    <circle className="living-map-haze" cx={x} cy={y} r={r+item.blur*1.8} style={{opacity:Math.min(.38,.12+item.intensitySpread/110)}}/>
    <circle className="living-map-body" cx={x} cy={y} r={r} style={{opacity:brightness}}/>
    <circle className="living-map-core" cx={x} cy={y} r={Math.max(12,r*(.24+item.averageIntensity/250))} style={{opacity:.45+item.averageIntensity/200}}/>
    <text x={x} y={y+5} textAnchor="middle">{item.label}</text>
  </g>;
}

function OverlapMarker({item}:{item:LivingMapAggregateItem}){
  const x=item.x*10,y=20+item.y*6.15,r=item.radius*1.45;
  return <circle className="living-map-overlap" cx={x} cy={y} r={r*.78} aria-hidden="true"/>;
}

function FamilyLabel({family,index}:{family:string;index:number}){const angle=index/LIVING_MAP_FAMILIES.length*Math.PI*2-Math.PI/2;return <text className="living-map-family" x={500+Math.cos(angle)*440} y={335+Math.sin(angle)*310} textAnchor="middle">{family.toLocaleUpperCase("en-CA")}</text>}
function spreadLabel(spread:number){return spread<10?"similar strength":spread<25?"some variation":"wide variation"}
function mapSummary(projection:LivingMapProjection){return `${projection.items.length} active group patterns from ${projection.participantTotal} people. ${projection.aromaContributors} contributed aroma and ${projection.tasteContributors} contributed taste.`}
