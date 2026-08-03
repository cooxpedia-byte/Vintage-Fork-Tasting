import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoSlider } from "@/components/tea-lab/TastingCardDialog";

describe("Tea Lab tasting-card photo slider", () => {
  it("renders one active image with previous and next controls for a gallery", () => {
    const html = renderToStaticMarkup(createElement(PhotoSlider, {
      teaName: "Moonlight White",
      photos: [
        { id: "photo-1", url: "https://signed.example/one.jpg", altText: null, createdAt: "2026-08-03T10:00:00.000Z" },
        { id: "photo-2", url: "https://signed.example/two.jpg", altText: "Wet leaf", createdAt: "2026-08-03T10:01:00.000Z" }
      ]
    }));

    expect(html).toContain('aria-label="Previous photo"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).toContain("1 / 2");
    expect(html).toContain('alt="Moonlight White tasting photo 1"');
    expect(html).not.toContain("two.jpg");
  });
});
