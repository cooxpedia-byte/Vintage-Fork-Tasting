import { notFound } from "next/navigation";
import { TeaSearchPreview } from "@/components/tea-lab/TeaSearchPreview";

export const dynamic = "force-dynamic";

export default function TeaSearchPreviewPage() {
  if (process.env.TEA_LAB_PALETTE_PREVIEW !== "true") notFound();

  return <main id="main-content" className="page-shell">
    <section>
      <p className="eyebrow">Local QA preview</p>
      <h1 className="page-title">Tea search</h1>
      <p className="page-lede">Try “jasmine” for an inventory match, or type a tea that is not in the suggestions and continue.</p>
      <TeaSearchPreview />
    </section>
  </main>;
}
