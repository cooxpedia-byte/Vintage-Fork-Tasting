import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TeaEditor, type TeaRecord } from "@/components/admin/TeaEditor";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeaEditorPage({ params }: { params: Promise<{ "tea-id": string }> }) {
  await requireStaff();
  const { "tea-id": teaId } = await params;
  let existing: TeaRecord | undefined;
  if (teaId !== "new") {
    const supabase = await createClient();
    const { data } = await supabase.from("teas").select("id,name,producer,origin,tea_type,default_character,default_brewing,default_steep_seconds,image_path,retired_at").eq("id", teaId).single();
    if (!data) notFound(); existing = data as TeaRecord;
  }
  return <><SiteHeader /><main className="page-shell" id="main-content"><Link className="btn btn-quiet" href="/admin/teas" prefetch={false}>← Tea library</Link><p className="eyebrow">Tea library</p><h1 className="page-title">{existing?.name ?? "New tea"}</h1><TeaEditor existing={existing} /></main></>;
}
