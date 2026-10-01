"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { editableStatuses, editableStatusLabels, validOrderRef, type EditableOrderStatus } from "@/lib/admin/order-operations";

export type OrderActionResult = {ok:boolean;message:string};
export async function changeOrderStatus(_previous:OrderActionResult,form:FormData):Promise<OrderActionResult> {
  const staff=await requireStaff(["admin"]);
  const client=await authorizedCommerceClient(staff.user.id);
  if(!client)return {ok:false,message:"Reconnect your store administrator account before changing orders."};
  const kind=form.get("kind"),id=form.get("orderId"),target=form.get("status"),revision=form.get("revision"),sourceVersion=form.get("sourceVersion"),operation=form.get("operationId"),reason=form.get("reason");
  if(!validOrderRef(kind,id)||typeof target!=="string"||!editableStatuses.includes(target as EditableOrderStatus)
    ||typeof revision!=="string"||!/^(0|[1-9][0-9]{0,14})$/.test(revision)||!Number.isSafeInteger(Number(revision))
    ||typeof operation!=="string"||!validOrderRef("native",operation)
    ||typeof sourceVersion!=="string"||!/^[a-f0-9]{64}$/.test(sourceVersion)
    ||typeof reason!=="string"||reason.trim().length>500||(reason.trim().length>0&&reason.trim().length<3)||form.get("confirmed")!=="yes")return {ok:false,message:"Review the order and confirm a valid status change. An optional note must contain at least 3 characters."};
  try {
    const result=await client.rpc("vf_admin_set_order_status_v1",{
      p_order_kind:kind,p_order_id:id,p_target_status:target,p_expected_revision:Number(revision),p_expected_source_version:sourceVersion,p_operation_id:operation,p_reason:reason.trim()||null,
    }).abortSignal(AbortSignal.timeout(15000));
    if(result.error)return {ok:false,message:result.error.code==="40001"
      ? "This order changed since you opened it. Refresh and review its current status."
      : result.error.code==="42501"?"Your account cannot change this order."
      : "The status was not confirmed. Refresh the order and review its payment and fulfillment status before retrying."};
    const data=result.data;
    if(!data||data.kind!==kind||data.orderId!==id||data.status!==target||data.revision!==Number(revision)+1)return {ok:false,message:"The result could not be confirmed. Refresh the order before retrying."};
    revalidatePath("/admin/orders");revalidatePath("/admin");
    if(kind==="native")revalidatePath("/admin/orders/native/"+id);
    return {ok:true,message:`Order marked ${editableStatusLabels[target as EditableOrderStatus]}.`};
  } catch {return {ok:false,message:"The result could not be confirmed. Refresh the order before retrying."};}
}
