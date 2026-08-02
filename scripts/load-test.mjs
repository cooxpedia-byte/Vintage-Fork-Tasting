import { createClient } from "@supabase/supabase-js";

const required=["LOAD_TEST_SITE_URL","LOAD_TEST_INVITE_CODE","LOAD_TEST_CONFIRM","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SECRET_KEY"];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length) fail(`Missing load-test variables: ${missing.join(", ")}`);
if(process.env.LOAD_TEST_CONFIRM!=="YES_DELETE_CREATED_PARTICIPANTS") fail("LOAD_TEST_CONFIRM must equal YES_DELETE_CREATED_PARTICIPANTS.");
const clientCount=Number(process.env.LOAD_TEST_CLIENTS??100);
if(!Number.isInteger(clientCount)||clientCount<1||clientCount>100) fail("LOAD_TEST_CLIENTS must be an integer from 1 to 100.");

const baseUrl=new URL(process.env.LOAD_TEST_SITE_URL);
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:event,error:eventError}=await admin.from("events").select("id,title,status,capacity").eq("invite_code",process.env.LOAD_TEST_INVITE_CODE.toUpperCase()).single();
if(eventError||!event) fail("The dedicated load-test event was not found.");
if(!event.title.startsWith("[LOAD TEST]")) fail("Refusing to use an event whose title does not start with [LOAD TEST].");
if(event.status!=="scheduled") fail("The load-test event must be scheduled and not live.");
if(event.capacity<clientCount) fail(`The load-test event capacity is ${event.capacity}, below ${clientCount}.`);
const {count:existingCount}=await admin.from("participants").select("id",{count:"exact",head:true}).eq("event_id",event.id);
if((existingCount??0)>0) fail("The load-test event must have no existing participants.");

const runId=Date.now().toString(36);
const created=[];
const measurements={join:[],heartbeat:[],state:[]};
try{
  for(let start=0;start<clientCount;start+=10){
    const batch=Array.from({length:Math.min(10,clientCount-start)},(_,offset)=>joinClient(start+offset));
    const joined=await Promise.allSettled(batch);
    created.push(...joined.filter(result=>result.status==="fulfilled").map(result=>result.value));
    const failed=joined.find(result=>result.status==="rejected");
    if(failed)throw failed.reason;
  }
  await runMeasured("heartbeat",created,entry=>request(`/api/events/${event.id}/heartbeat`,{method:"POST",headers:{cookie:entry.cookie}}));
  await runMeasured("state",created,entry=>request(`/api/events/${event.id}/state`,{headers:{cookie:entry.cookie}}));
  console.log(JSON.stringify({ok:true,clients:clientCount,join:summarize(measurements.join),heartbeat:summarize(measurements.heartbeat),state:summarize(measurements.state)}));
}finally{
  const ids=created.map(entry=>entry.participantId);
  if(ids.length){const {error}=await admin.from("participants").delete().in("id",ids);if(error)console.error(`Load-test cleanup failed: ${error.message}`)}
}

async function joinClient(index){
  const started=performance.now();
  const response=await request("/api/events/join",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({inviteCode:process.env.LOAD_TEST_INVITE_CODE,displayName:`Load Test ${runId} ${index+1}`,email:"",marketingConsent:null})});
  measurements.join.push(performance.now()-started);
  const data=await response.json();
  const setCookie=response.headers.getSetCookie?.()[0]??response.headers.get("set-cookie")??"";
  const cookie=setCookie.split(";",1)[0];
  if(!cookie||!data.participant_id)throw new Error("Join response did not include a participant session.");
  return{participantId:data.participant_id,cookie};
}

async function runMeasured(name,entries,operation){
  await Promise.all(entries.map(async entry=>{const started=performance.now();await operation(entry);measurements[name].push(performance.now()-started)}));
}

async function request(path,options={}){
  const response=await fetch(new URL(path,baseUrl),{...options,redirect:"manual"});
  if(!response.ok)throw new Error(`${options.method??"GET"} ${path} returned HTTP ${response.status}.`);
  return response;
}

function summarize(values){const sorted=[...values].sort((a,b)=>a-b);const percentile=value=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*value)-1)]);return{requests:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:Math.round(sorted.at(-1)??0)}}
function fail(message){console.error(message);process.exit(1)}
