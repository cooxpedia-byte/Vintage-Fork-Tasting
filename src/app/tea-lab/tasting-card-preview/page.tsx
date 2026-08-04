import { notFound } from "next/navigation";
import { TastingCardArtworkPreview } from "@/components/tea-lab/TastingCardArtworkPreview";

export const dynamic = "force-dynamic";

export default function TastingCardPreviewPage() {
  if (process.env.TEA_LAB_PALETTE_PREVIEW !== "true") notFound();

  return <main id="main-content" className="page-shell">
    <section>
      <p className="eyebrow">Local QA preview</p>
      <h1 className="page-title">Supplied tasting card artwork</h1>
      <p className="page-lede">The supplied card artwork, now driven by editable tasting and brewing values with tea-family colour palettes.</p>
      <TastingCardArtworkPreview />
    </section>
  </main>;
}
