"use client";

import { useActionState, useId, useState } from "react";
import { changeOrderStatus } from "@/app/admin/orders/actions";
import { editableStatusLabels, type OrderOperation, type EditableOrderStatus } from "@/lib/admin/order-operations";

export function OrderStatusControl({order,number}:{order:OrderOperation;number:string}) {
  const [open,setOpen]=useState(false);
  const [operation,setOperation]=useState("");
  if(!order.allowedTargets.length)return null;
  return <div className="admin-order-status-control">
    {!open?<button type="button" className="btn btn-secondary" onClick={()=>{setOperation(crypto.randomUUID());setOpen(true);}}>Change status</button>:
      <StatusForm key={operation} order={order} number={number} operation={operation} close={()=>setOpen(false)}/>}
  </div>;
}

function StatusForm({order,number,operation,close}:{order:OrderOperation;number:string;operation:string;close:()=>void}) {
  const fieldId=useId();
  const [target,setTarget]=useState<EditableOrderStatus|"">("");
  const [result,action,pending]=useActionState(changeOrderStatus,{ok:false,message:""});
  return <form action={action} className="admin-order-action-form" aria-label={`Change status for order ${number}`}>
        <input type="hidden" name="kind" value={order.kind}/><input type="hidden" name="orderId" value={order.orderId}/>
        <input type="hidden" name="revision" value={order.revision}/><input type="hidden" name="operationId" value={operation}/>
        <input type="hidden" name="sourceVersion" value={order.sourceVersion}/>
        <label htmlFor={fieldId+"-status"}>New status</label>
        <select id={fieldId+"-status"} name="status" required value={target} disabled={pending||result.ok} onChange={e=>setTarget(e.target.value as EditableOrderStatus)}>
          <option value="" disabled>Choose a status</option>
          {order.allowedTargets.map(s=><option key={s} value={s}>{editableStatusLabels[s]}</option>)}
        </select>
        <label htmlFor={fieldId+"-reason"}>Internal note (optional)</label>
        <input id={fieldId+"-reason"} name="reason" minLength={3} maxLength={500} disabled={pending||result.ok}/>
        <label className="admin-order-confirm"><input key={target} name="confirmed" type="checkbox" value="yes" required disabled={pending||result.ok||!target}/>
          {target==="completed"?`I have fulfilled order ${number} and want to mark it Completed.`:target?`Set order ${number} to ${editableStatusLabels[target]}.`:"Choose and confirm the new order status."}
        </label>
        <div className="admin-order-action-buttons"><button type="submit" className="btn btn-gold" disabled={pending||result.ok||!target}>{pending?"Saving…":"Save status"}</button>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={close}>Close</button></div>
        {result.message&&<p role={result.ok?"status":"alert"}>{result.message}</p>}
      </form>;
}
