"use client";

import {useMemo,useState} from "react";
import {RoomDiscoveryCard} from "@/components/live/RoomDiscoveryCard";
import {buildDiscoveryPatterns,type DiscoveryCard,type DiscoveryCardItem,type SpokespersonState} from "@/lib/discovery-cards";
import type {HostCommandPayload} from "@/lib/host-command";
import type {EventCommand} from "@/types/domain";

type HostDiscoveryCard={
  id:string;breakoutRoomId:string;roomNumber:number;participantCount:number;lockedAt:string|null;sourceVersion:number;
  curiosity:string|null;roomQuote:string|null;quoteAttributed:boolean;spokespersonState:SpokespersonState;
  spokespersonParticipantId:string|null;spokespersonName:string|null;
  participants:Array<{id:string;displayName:string}>;items:DiscoveryCardItem[];
};

export type HostDiscoveryBoard={
  session:null|{id:string;status:"active"|"returning"|"complete";eventFlightItemId:string;completedAt:string|null};
  cards:HostDiscoveryCard[];
  openCardIds:string[];
  surfacedCuriosityCardId:string|null;
};

export const EMPTY_HOST_DISCOVERY_BOARD:HostDiscoveryBoard={session:null,cards:[],openCardIds:[],surfacedCuriosityCardId:null};

export function HostDiscoveryPanel({board,teaName,busy,enabled,onCommand}:{board:HostDiscoveryBoard;teaName:string;busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  const [speakerChoice,setSpeakerChoice]=useState<Record<string,string>>({});
  const cards=useMemo(()=>board.cards.map(toDiscoveryCard),[board.cards]);
  const patterns=useMemo(()=>buildDiscoveryPatterns(cards),[cards]);
  const openCards=board.openCardIds.map(id=>cards.find(card=>card.id===id)).filter((card):card is DiscoveryCard=>Boolean(card));
  const nextCard=openCards.length?cards[(cards.findIndex(card=>card.id===openCards.at(-1)?.id)+1)%Math.max(1,cards.length)]:cards[0];
  return <section className="card host-discovery-panel" aria-labelledby="host-discovery-title">
    <div className="card-header"><div><p className="eyebrow">Tables returned · {teaName}</p><h2 className="card-title" id="host-discovery-title">Room discoveries</h2><p>Open one table story, compare two, or surface a question. These cards summarize structured observations—not chat or transcripts.</p></div><span className="chip">{cards.length} card{cards.length===1?"":"s"}</span></div>
    <nav className="discovery-table-strip" aria-label="Returned table cards">{cards.map(card=>{const comparing=board.openCardIds.length>0&&!board.openCardIds.includes(card.id);return <button className={`discovery-table-tab${board.openCardIds.includes(card.id)?" active":""}`} type="button" aria-pressed={board.openCardIds.includes(card.id)} disabled={!enabled||busy} key={card.id} onClick={()=>void onCommand(comparing?"compare_discovery_card":"open_discovery_card",{cardId:card.id})}><strong>Table {card.roomNumber}</strong><span>{card.shared.length} shared · {card.unique.length} unique · {comparing?"Compare":"Open"}</span></button>})}</nav>
    {openCards.length>0?<div className={`host-discovery-open ${openCards.length>1?"compare":""}`}>{openCards.map(card=>{
      const raw=board.cards.find(candidate=>candidate.id===card.id)!;
      const selected=speakerChoice[card.id]??raw.spokespersonParticipantId??raw.participants[0]?.id??"";
      const canMarkShared=["accepted","invited"].includes(raw.spokespersonState);
      return <RoomDiscoveryCard key={card.id} card={card} teaName={teaName} highlightCuriosity={board.surfacedCuriosityCardId===card.id} actions={<div className="host-discovery-card-actions">
        <button className="btn btn-secondary" type="button" disabled={!enabled||busy||!card.curiosity} onClick={()=>void onCommand("surface_discovery_curiosity",{cardId:card.id})}>Surface curiosity</button>
        <label>Invite to share<select value={selected} disabled={!enabled||busy||!raw.participants.length} onChange={event=>setSpeakerChoice(current=>({...current,[card.id]:event.target.value}))}>{raw.participants.map(participant=><option value={participant.id} key={participant.id}>{participant.displayName}{participant.id===raw.spokespersonParticipantId?" · volunteered":""}</option>)}</select></label>
        <button className="btn btn-primary" type="button" disabled={!enabled||busy||!selected||["invited","accepted","shared"].includes(raw.spokespersonState)} onClick={()=>void onCommand("invite_discovery_spokesperson",{cardId:card.id,participantId:selected})}>{raw.spokespersonState==="accepted"?`${raw.spokespersonName??"Presenter"} is ready`:raw.spokespersonState==="invited"?"Invitation sent":raw.spokespersonState==="shared"?"Shared":"Invite privately"}</button>
        {canMarkShared&&<button className="btn btn-secondary" type="button" disabled={!enabled||busy} onClick={()=>void onCommand("complete_discovery_share",{cardId:card.id})}>Mark shared</button>}
      </div>}/>;
    })}</div>:<div className="empty-state discovery-board-empty"><h3>Cards are gathered.</h3><p>They stay collapsed until you open a table.</p></div>}
    <div className="row host-discovery-navigation"><button className="btn btn-secondary" type="button" disabled={!enabled||busy||!nextCard} onClick={()=>nextCard&&void onCommand("open_discovery_card",{cardId:nextCard.id})}>Next table</button><button className="btn btn-quiet" type="button" disabled={!enabled||busy||!board.openCardIds.length} onClick={()=>void onCommand("close_discovery_cards")}>Close cards</button></div>
    {(patterns.acrossRooms.length>0||patterns.oneTable.length>0||patterns.contrasting.length>0||patterns.curiosities.length>0)&&<section className="cross-room-patterns" aria-labelledby="cross-room-patterns-title"><h3 id="cross-room-patterns-title">Across the tables</h3><div className="cross-room-pattern-grid">
      <div><strong>Appeared across rooms</strong>{patterns.acrossRooms.length?<ul>{patterns.acrossRooms.slice(0,6).map(pattern=><li key={pattern.key}>{pattern.label} · {pattern.roomNumbers.length} tables</li>)}</ul>:<p className="help">No repeated discovery yet.</p>}</div>
      <div><strong>Found at one table</strong>{patterns.oneTable.length?<ul>{patterns.oneTable.slice(0,6).map(pattern=><li key={pattern.key}>{pattern.label} · Table {pattern.roomNumbers[0]}</li>)}</ul>:<p className="help">Every current note appeared more than once.</p>}</div>
      {(patterns.contrasting.length>0||patterns.curiosities.length>0)&&<div><strong>Contrasting & curious</strong><ul>{patterns.contrasting.slice(0,3).map(pattern=><li key={`contrast-${pattern.roomNumber}-${pattern.text}`}>{pattern.text} · Table {pattern.roomNumber}</li>)}{patterns.curiosities.slice(0,3).map(pattern=><li key={`curious-${pattern.roomNumber}-${pattern.text}`}>{pattern.text} · Table {pattern.roomNumber}</li>)}</ul></div>}
    </div></section>}
    <div className="notice"><strong>Presentation boundary:</strong> opening, comparing, or hiding cards changes only what the room sees now. The locked table artifact and every personal tasting response stay unchanged.</div>
  </section>;
}

function toDiscoveryCard(card:HostDiscoveryCard):DiscoveryCard{
  return{
    id:card.id,breakoutRoomId:card.breakoutRoomId,roomNumber:card.roomNumber,participantCount:card.participantCount,
    shared:card.items.filter(item=>item.category==="shared"),unique:card.items.filter(item=>item.category==="unique"),
    changed:card.items.filter(item=>item.category==="changed"),contrasting:card.items.filter(item=>item.category==="contrasting"),
    curiosity:card.curiosity,roomQuote:card.roomQuote,quoteAttributed:card.quoteAttributed,lockedAt:card.lockedAt,
    sourceVersion:card.sourceVersion,hasSpokesperson:Boolean(card.spokespersonParticipantId)&&card.spokespersonState!=="passed",spokespersonState:card.spokespersonState
  };
}
