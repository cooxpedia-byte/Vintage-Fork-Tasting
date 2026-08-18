import type {DiscoveryIdentityEmblem} from "@/lib/discovery-identity";

export function DiscoveryEmblem({kind,className=""}:{kind:DiscoveryIdentityEmblem;className?:string}){
  return <span className={`discovery-emblem ${className}`} aria-hidden="true" data-emblem={kind}>
    <svg viewBox="0 0 64 64" role="presentation">
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      {kind==="flower"&&<><circle cx="32" cy="32" r="4"/><path d="M32 28c-8-2-9-12-2-15 5 3 6 9 2 15Zm4 3c2-8 12-9 15-2-3 5-9 6-15 2Zm-4 5c8 2 9 12 2 15-5-3-6-9-2-15Zm-5-4c-2 8-12 9-15 2 3-5 9-6 15-2Z" fill="none" stroke="currentColor" strokeWidth="2"/></>}
      {kind==="compass"&&<><path d="m39 19-4.5 11.5L23 35l4.5-11.5L39 19Z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="31" cy="31" r="2"/></>}
      {kind==="map"&&<path d="M17 21l10-4 10 4 10-4v27l-10 4-10-4-10 4V21Zm10-4v27m10-23v27" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {kind==="mountain"&&<path d="m14 45 13-23 6 10 5-8 12 21H14Zm8-9 5-4 4 3 2-3" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {kind==="garden"&&<><path d="M32 49V25m0 12c-9 0-13-5-13-11 8-1 13 3 13 11Zm0 5c9 0 13-5 13-11-8-1-13 3-13 11Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M18 49h28" stroke="currentColor" strokeWidth="2"/></>}
      {kind==="moon"&&<path d="M41 17c-12 3-16 19-8 27 4 4 10 5 15 2-3 5-9 8-15 8-12 0-21-9-21-21 0-10 8-19 18-20 4 0 8 1 11 4Z" fill="none" stroke="currentColor" strokeWidth="2"/>}
      {kind==="story"&&<><path d="M17 18h19c6 0 11 5 11 11v20H27c-6 0-10-4-10-10V18Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M27 24v25m5-18h9m-9 6h9" stroke="currentColor" strokeWidth="2"/></>}
      {kind==="leaf"&&<><path d="M46 16C28 18 18 28 19 46c18 1 28-9 27-30Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M18 49c6-10 13-17 23-26" stroke="currentColor" strokeWidth="2"/></>}
    </svg>
  </span>;
}
