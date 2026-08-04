import { notFound } from "next/navigation";
import { FlavorPalettePreview } from "@/components/tea-lab/FlavorPalettePreview";

export const dynamic = "force-dynamic";

export default function FlavorPalettePreviewPage() {
  if (process.env.TEA_LAB_PALETTE_PREVIEW !== "true") notFound();

  return <main id="main-content" className="page-shell">
    <section>
      <p className="eyebrow">Local QA preview</p>
      <h1 className="page-title">Tea Lab flavour wheel</h1>
      <p className="page-lede">Turn the wheel, open a category, and build a personal palette of up to five flavours.</p>
      <FlavorPalettePreview />
    </section>
  </main>;
}
