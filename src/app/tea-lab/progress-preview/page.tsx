import { notFound } from "next/navigation";
import { TeaLabProgressPreview } from "@/components/tea-lab/TeaLabProgressPreview";

export const dynamic = "force-dynamic";

export default function TeaLabProgressPreviewPage() {
  if (process.env.TEA_LAB_PALETTE_PREVIEW !== "true") notFound();

  return <main id="main-content" className="page-shell">
    <section>
      <p className="eyebrow">Local QA preview</p>
      <h1 className="page-title">Tasting progress navigation</h1>
      <p className="page-lede">Tap a visited step to return to that page without losing access to the pages you already reached.</p>
      <TeaLabProgressPreview />
    </section>
  </main>;
}
