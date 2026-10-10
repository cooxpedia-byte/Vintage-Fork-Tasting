import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({staff:vi.fn(),commerce:vi.fn(),revalidate:vi.fn(),rpc:vi.fn(),response:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireStaff:mocks.staff}));
vi.mock("@/lib/supabase/commerce-server",()=>({authorizedCommerceClient:mocks.commerce}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { changeOrderStatus } from "@/app/admin/orders/actions";

const orderId="11111111-1111-4111-8111-111111111111";
const operationId="22222222-2222-4222-8222-222222222222";
const sourceVersion="a".repeat(64);
const prior={ok:false,message:""};
const receipt={kind:"native",orderId,status:"completed",revision:4,sourceVersion,replayed:false};

function form(overrides:Record<string,string|null>={}) {
  const fields:Record<string,string>={kind:"native",orderId,status:"completed",revision:"3",
    sourceVersion,operationId,reason:"Packed and handed to the carrier",confirmed:"yes"};
  for(const [key,value] of Object.entries(overrides)) {
    if(value===null)delete fields[key];else fields[key]=value;
  }
  const request=new FormData();
  for(const [key,value] of Object.entries(fields))request.set(key,value);
  return request;
}
function response(data:unknown,error:unknown=null) {
  mocks.response.mockResolvedValue({data,error});
}
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.staff.mockResolvedValue({user:{id:"verified-tasting-admin"}});
  mocks.commerce.mockResolvedValue({rpc:mocks.rpc});
  mocks.rpc.mockReturnValue({abortSignal:mocks.response});
  response(receipt);
});

describe("administrator order status action",()=>{
  it("requires administrator access before obtaining a store session",async()=>{
    mocks.staff.mockRejectedValue(Error("unauthorized"));
    await expect(changeOrderStatus(prior,form())).rejects.toThrow("unauthorized");
    expect(mocks.staff).toHaveBeenCalledWith(["admin"]);
    expect(mocks.commerce).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses an unavailable or mismatched bound store session before writing",async()=>{
    mocks.commerce.mockResolvedValue(null);
    await expect(changeOrderStatus(prior,form())).resolves.toMatchObject({ok:false,
      message:expect.stringContaining("Reconnect")});
    expect(mocks.commerce).toHaveBeenCalledWith("verified-tasting-admin");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid native ID",{orderId:"bad"}],
    ["invalid imported ID",{kind:"imported",orderId:"01"}],
    ["unknown kind",{kind:"matcha"}],
    ["uneditable target",{status:"failed"}],
    ["invalid source version",{sourceVersion:"ABC123"}],
    ["missing source version",{sourceVersion:null}],
    ["negative revision",{revision:"-1"}],
    ["fractional revision",{revision:"3.5"}],
    ["unsafe revision",{revision:"9007199254740992"}],
    ["invalid operation ID",{operationId:"bad"}],
    ["missing confirmation",{confirmed:null}],
    ["incorrect confirmation",{confirmed:"false"}],
    ["short nonblank note",{reason:"x"}],
    ["oversized note",{reason:"x".repeat(501)}],
  ] as const)("rejects %s without calling the mutation",async(_name,change)=>{
    expect(await changeOrderStatus(prior,form(change))).toMatchObject({ok:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("submits the exact versioned request with a normalized fulfillment reference",async()=>{
    expect(await changeOrderStatus(prior,form({reason:"  Staff confirmed delivery  ",
      fulfillmentReference:"  Carrier delivery proof ABC123  "}))).toEqual({ok:true,message:"Order marked Completed."});
    expect(mocks.rpc.mock.calls).toEqual([["vf_admin_set_order_status_v2",{
      p_order_kind:"native",p_order_id:orderId,p_target_status:"completed",p_expected_revision:3,
      p_expected_source_version:sourceVersion,p_operation_id:operationId,
      p_reason:"Staff confirmed delivery",p_fulfillment_reference:"Carrier delivery proof ABC123",
    }]]);
    expect(mocks.response).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"],["/admin"],["/admin/orders/native/"+orderId]]);
  });

  it.each([null,"","   "])("leaves source-specific reference requirements to server authority for %s",async(reference)=>{
    expect(await changeOrderStatus(prior,form({fulfillmentReference:reference,reason:"   "}))).toMatchObject({ok:true});
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_set_order_status_v2",expect.objectContaining({
      p_fulfillment_reference:null,p_reason:null,
    }));
  });

  it.each(["x","ab","x".repeat(201)])("rejects a supplied malformed fulfillment reference %#",async(reference)=>{
    expect(await changeOrderStatus(prior,form({fulfillmentReference:reference}))).toMatchObject({ok:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["abc","x".repeat(200)])("accepts the reference length boundary %#",async(reference)=>{
    expect(await changeOrderStatus(prior,form({fulfillmentReference:reference}))).toMatchObject({ok:true});
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_set_order_status_v2",expect.objectContaining({p_fulfillment_reference:reference}));
  });

  it.each(["processing","on_hold"])("does not attach fulfillment proof to %s",async(status)=>{
    expect(await changeOrderStatus(prior,form({status,fulfillmentReference:"Delivery proof"}))).toMatchObject({ok:false});
    expect(mocks.rpc).not.toHaveBeenCalled();
    response({...receipt,status});
    expect(await changeOrderStatus(prior,form({status}))).toMatchObject({ok:true});
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_set_order_status_v2",expect.objectContaining({p_target_status:status,p_fulfillment_reference:null}));
  });

  it("preserves the operation and source fence on an identical retry",async()=>{
    response({...receipt,replayed:true});
    const request=form({fulfillmentReference:"Staff handoff record"});
    expect(await changeOrderStatus(prior,request)).toMatchObject({ok:true});
    expect(await changeOrderStatus(prior,request)).toMatchObject({ok:true});
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
  });

  it.each([
    ["40001","This order changed since you opened it."],
    ["42501","Your account cannot change this order."],
    ["22023","The status was not confirmed."],
    ["55000","The status was not confirmed."],
    ["23505","The status was not confirmed."],
  ])("preserves server %s rejection without leaking details or revalidating",async(code,message)=>{
    response(null,{code,message:"private payment or invoice detail"});
    const result=await changeOrderStatus(prior,form({fulfillmentReference:"Delivery proof"}));
    expect(result).toMatchObject({ok:false,message:expect.stringContaining(message)});
    expect(JSON.stringify(result)).not.toContain("private payment or invoice detail");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing receipt",null],
    ["wrong kind",{...receipt,kind:"imported"}],
    ["wrong order",{...receipt,orderId:operationId}],
    ["wrong status",{...receipt,status:"processing"}],
    ["unchanged revision",{...receipt,revision:3}],
    ["skipped revision",{...receipt,revision:5}],
    ["invalid revision",{...receipt,revision:-1}],
  ])("treats a %s as unconfirmed",async(_name,data)=>{
    response(data);
    expect(await changeOrderStatus(prior,form())).toMatchObject({ok:false,
      message:expect.stringContaining("could not be confirmed")});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("does not report completion after a lost response",async()=>{
    mocks.response.mockRejectedValue(Error("timeout"));
    expect(await changeOrderStatus(prior,form())).toMatchObject({ok:false,
      message:expect.stringContaining("could not be confirmed")});
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("preserves imported identifiers and revalidates only their relevant views",async()=>{
    const importedId="18446744073709551615";
    response({...receipt,kind:"imported",orderId:importedId});
    expect(await changeOrderStatus(prior,form({kind:"imported",orderId:importedId}))).toMatchObject({ok:true});
    expect(mocks.rpc).toHaveBeenCalledWith("vf_admin_set_order_status_v2",expect.objectContaining({
      p_order_kind:"imported",p_order_id:importedId,p_fulfillment_reference:null,
    }));
    expect(mocks.revalidate.mock.calls).toEqual([["/admin/orders"],["/admin"]]);
  });
});
