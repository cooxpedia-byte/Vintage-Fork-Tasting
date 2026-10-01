import { orderStatusDisplay } from "@/lib/admin/order-status";
import type { OrderOperation } from "@/lib/admin/order-operations";

export function OrderStatusBadge({source,status,type=null,operation}:{source:"native"|"historical";status:string|null;type?:string|null;operation?:OrderOperation}) {
  const display=orderStatusDisplay(source==="native"?{source,status}:{source,status,type});
  const current=operation&&operation.status!=="unknown"?orderStatusDisplay({source:"historical",status:operation.status,type:"shop_order"}):display;
  return <div className="admin-order-state">
    <span className={current.badgeClassName}>{current.label}</span>
    {operation?.staleOverlay?<small role="status">Order details changed — review required</small>:operation&&operation.revision>0&&<small>Updated in dashboard</small>}
  </div>;
}
