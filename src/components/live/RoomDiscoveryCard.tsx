import type {DiscoveryCard,DiscoveryCardItem} from "@/lib/discovery-cards";

export function RoomDiscoveryCard({card,teaName,compact=false,highlightCuriosity=false,actions}:{card:DiscoveryCard;teaName:string;compact?:boolean;highlightCuriosity?:boolean;actions?:React.ReactNode}){
  return <article className={`room-discovery-card${compact?" compact":""}`} aria-labelledby={`room-discovery-title-${card.id}`}>
    <header><div><p className="eyebrow">Table {card.roomNumber} · {card.participantCount} taster{card.participantCount===1?"":"s"}</p><h3 id={`room-discovery-title-${card.id}`}>{teaName}</h3></div>{card.hasSpokesperson&&<span className="chip">Share for our table</span>}</header>
    <DiscoveryGroup title="Shared" items={card.shared} showPrevalence />
    <DiscoveryGroup title="Unique" items={card.unique}/>
    {!compact&&<DiscoveryGroup title="Changed" items={card.changed}/>}
    {!compact&&<DiscoveryGroup title="Contrasting" items={card.contrasting}/>}
    {!card.shared.length&&!card.unique.length&&!card.changed.length&&!card.contrasting.length&&!card.curiosity&&!card.roomQuote&&<div className="discovery-empty"><strong>This group experienced the tea in many different ways.</strong><span>Your table card can speak for the group.</span></div>}
    {card.curiosity&&<div className={`discovery-curiosity${highlightCuriosity?" highlighted":""}`}><strong>Curious</strong><span>{card.curiosity}</span></div>}
    {!compact&&card.roomQuote&&<blockquote>“{card.roomQuote}”{card.quoteAttributed&&<small>Shared with permission</small>}</blockquote>}
    {actions&&<footer>{actions}</footer>}
  </article>;
}

function DiscoveryGroup({title,items,showPrevalence=false}:{title:string;items:DiscoveryCardItem[];showPrevalence?:boolean}){
  if(!items.length)return null;
  return <section className={`discovery-group discovery-${title.toLocaleLowerCase("en-CA")}`}><h4>{title}</h4><ul>{items.map(item=><li key={item.id}><span>{item.text}</span>{showPrevalence&&item.prevalenceCount&&item.prevalenceTotal>1?<small>{item.prevalenceCount}/{item.prevalenceTotal} noticed</small>:null}</li>)}</ul></section>;
}
