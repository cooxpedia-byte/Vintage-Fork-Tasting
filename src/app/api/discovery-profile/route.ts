import {NextResponse} from "next/server";
import {z} from "zod";
import {loadPrivateDiscoveryProfile,recalculateDiscoveryIdentities} from "@/lib/discovery-identity-server";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";
import {createRequestClient} from "@/lib/supabase/request-auth";

const actionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("set_identity_preferences"),identityId:z.string().uuid(),featured:z.boolean(),hidden:z.boolean()}),
  z.object({action:z.literal("set_reveals"),enabled:z.boolean()})
]);

export async function GET(request:Request){
  try{
    const{user}=await createRequestClient(request);
    if(!user)return response({error:"Authentication required."},401);
    const admin=createAdminClient();
    await recalculateDiscoveryIdentities(admin,user.id);
    return response({snapshot:await loadPrivateDiscoveryProfile(admin,user.id)});
  }catch(error){logger.error("discovery_profile_load_failed",error,{surface:"discovery_profile"});return response({error:"Your Discovery Profile could not be loaded."},503)}
}

export async function POST(request:Request){
  try{
    const{client,user}=await createRequestClient(request);
    if(!user)return response({error:"Authentication required."},401);
    const parsed=actionSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return response({error:"That discovery preference is not valid."},400);
    const result=parsed.data.action==="set_identity_preferences"
      ?await client.rpc("set_my_discovery_identity_preferences",{p_identity_id:parsed.data.identityId,p_featured:parsed.data.featured,p_hidden:parsed.data.hidden})
      :await client.rpc("set_my_discovery_reveal_preference",{p_enabled:parsed.data.enabled});
    if(result.error){
      if(result.error.message.includes("discovery_feature_limit"))return response({error:"You can feature up to two identities."},409);
      throw result.error;
    }
    return response({snapshot:await loadPrivateDiscoveryProfile(createAdminClient(),user.id)});
  }catch(error){logger.error("discovery_profile_preference_failed",error,{surface:"discovery_profile"});return response({error:"That discovery preference could not be saved."},503)}
}

function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
