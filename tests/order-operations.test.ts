import type { SupabaseClient } from "@supabase/supabase-js";
import { describe,expect,it,vi } from "vitest";
import { loadOrderOperations,parseOrderOperations } from "@/lib/admin/order-operations";

const id="10000000-0000-4000-8000-000000000001";
const otherId="20000000-0000-4000-8000-000000000001";
const refs=[{kind:"native" as const,orderId:id}];
const operation={...refs[0],status:"processing",revision:0,sourceStatus:"paid",sourceVersion:"a".repeat(64),
  allowedTargets:["on_hold","completed"],staleOverlay:false,reviewReason:null};
const envelope=(row:unknown=operation)=>({operational:true,orders:[row]});

describe("trusted native order operations",()=>{
  it("keeps fulfillment proof requirements from the server while defaulting older contracts to false",()=>{
    expect(parseOrderOperations(envelope({...operation,fulfillmentReferenceRequired:true}),refs).get("native:"+id))
      .toMatchObject({allowedTargets:["on_hold","completed"],fulfillmentReferenceRequired:true});
    expect(parseOrderOperations(envelope(),refs).get("native:"+id)?.fulfillmentReferenceRequired).toBe(false);
    expect(parseOrderOperations(envelope({...operation,fulfillmentReferenceRequired:false}),refs).get("native:"+id)?.fulfillmentReferenceRequired).toBe(false);
  });

  it.each([null,"true",1,{},[]])("fails closed on an invalid proof requirement %#",value=>{
    expect(()=>parseOrderOperations(envelope({...operation,fulfillmentReferenceRequired:value}),refs)).toThrow();
  });

  it("keeps refused authority refused even when the source status is paid",()=>{
    const result=parseOrderOperations(envelope({...operation,allowedTargets:[],reviewReason:"not_actionable",
      fulfillmentReferenceRequired:true}),refs).get("native:"+id);
    expect(result).toMatchObject({sourceStatus:"paid",allowedTargets:[],reviewReason:"not_actionable",fulfillmentReferenceRequired:true});
  });

  it("keeps completed and stale records without actionable targets",()=>{
    expect(parseOrderOperations(envelope({...operation,status:"completed",sourceStatus:"fulfilled",revision:2,
      allowedTargets:[]}),refs).get("native:"+id)).toMatchObject({status:"completed",allowedTargets:[]});
    expect(parseOrderOperations(envelope({...operation,allowedTargets:[],staleOverlay:true,reviewReason:"source_changed"}),refs)
      .get("native:"+id)).toMatchObject({allowedTargets:[],staleOverlay:true,reviewReason:"source_changed"});
  });

  it.each([
    {...operation,orderId:otherId},
    {...operation,sourceVersion:"bad"},
    {...operation,revision:-1},
    {...operation,allowedTargets:["failed"]},
    {...operation,allowedTargets:["completed","completed"]},
    {...operation,staleOverlay:true},
  ])("refuses mismatched or inconsistent authority %#",row=>{
    expect(()=>parseOrderOperations(envelope(row),refs)).toThrow();
  });

  it("never manufactures controls after an authority query error",async()=>{
    const rpc=vi.fn(()=>({abortSignal:vi.fn().mockResolvedValue({data:envelope(),error:{code:"42501"}})}));
    const result=await loadOrderOperations({rpc} as unknown as SupabaseClient,refs);
    expect(result.orders.size).toBe(0);
    expect(result.error).toMatch(/could not be loaded/);
    expect(rpc).toHaveBeenCalledWith("vf_admin_order_operations_v1",{p_refs:refs});
  });

  it("refuses missing or extra operation records instead of returning a partial permission set",()=>{
    expect(()=>parseOrderOperations({operational:true,orders:[]},refs)).toThrow();
    expect(()=>parseOrderOperations({operational:true,orders:[operation,operation]},refs)).toThrow();
    expect(()=>parseOrderOperations(envelope(),[...refs,...refs])).toThrow();
  });
});
