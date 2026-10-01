import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoSlider, TastingCardPresentation, TastingRecordDetails, tastingCardInfusionDataSet, tastingCardStyleLengthClass, tastingCardTeaTheme, tastingCardTitleLengthClass } from "@/components/tea-lab/TastingCardDialog";
import type { JournalCard } from "@/lib/tea-lab/journal";

const card: JournalCard = {
  id: "solo:card-1", source: "solo", sourceId: "card-1", teaName: "Anji White Tea", origin: "China – Anji County", teaType: "Green",
  rating: 3, intensity: "subtle", descriptors: [{ stableId: null, label: "Lychee", mapped: false }], firstImpression: "Silky",
  personalNotes: "Third infusion opened.", completedAt: "2026-08-03T12:00:00.000Z", saved: false, position: 1, sealClass: "documented_tasting",
  brewing: {
    style: "gongfu", leafGrams: 8, waterMl: 125, waterTemperatureC: 85, waterSource: "Tap", vessel: "Gaiwan", initialSteepSeconds: 35,
    instructions: null, preparationNotes: null,
    stages: [
      { label: "Rinse (optional)", durationSeconds: 5, temperatureC: 85, notes: null },
      { label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Sweet" }
    ]
  }
};

describe("Tea Lab tasting-card photo slider", () => {
  it("renders personal notes, brewing notes and photos as readable record details", () => {
    const html = renderToStaticMarkup(createElement(TastingRecordDetails, {
      card: {
        ...card,
        personalNotes: "Third infusion opened.\nTry a shorter steep next time.",
        brewing: { ...card.brewing!, preparationNotes: "Warm the gaiwan first.", instructions: "Use freshly heated water." },
        photos: [
          { id: "photo-1", url: "https://signed.example/leaf.jpg", altText: "Wet leaf", createdAt: "2026-08-03T10:00:00.000Z" },
          { id: "photo-2", url: "https://signed.example/cup.jpg", altText: "Tea in the cup", createdAt: "2026-08-03T10:01:00.000Z" }
        ]
      }
    }));

    expect(html).toContain("First impression");
    expect(html).toContain("Silky");
    expect(html).toContain("Third infusion opened.\nTry a shorter steep next time.");
    expect(html).toContain("white-space:pre-wrap");
    expect(html).toContain("Warm the gaiwan first.");
    expect(html).toContain("Use freshly heated water.");
    expect(html).toContain('alt="Wet leaf"');
    expect(html).toContain('aria-label="Next photo"');
    expect(html).not.toContain("tasting-card-flip-target");
  });

  it("shows a clear empty state when a record has no notes or photos", () => {
    const html = renderToStaticMarkup(createElement(TastingRecordDetails, {
      card: { ...card, firstImpression: null, personalNotes: null, brewing: null, photos: [] }
    }));

    expect(html).toContain("No personal notes recorded for this tasting.");
    expect(html).not.toContain("tasting-card-gallery");
  });

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

  it("renders themed front and back card faces with the full tasting and brewing record", () => {
    const front = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false
    }));
    const back = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: true
    }));

    expect(front).toContain("tasting-card-theme-green");
    expect(front).toContain('/tea-cards/anji-white-tea-front-green.png');
    expect(front).toContain("Digital tasting card");
    expect(front).toContain("Documented Tasting");
    expect(front).toContain("tasting-card-personal-record");
    expect(front).toContain('aria-label="Tasting source"');
    expect(front).toContain("Flip for brewing details");
    expect(front).toContain("Lychee");
    expect(back).toContain("is-flipped");
    expect(back).toContain('/tea-cards/anji-white-tea-back-green.png');
    expect(back).toContain("Brewing record");
    expect(back).toContain("Infusion data set");
    expect(back).toContain("Combined tasting notes");
    expect(back).toContain("Sweet");
    expect(back).not.toContain("Infusion 1");
    expect(back).toContain("85 °C");
  });

  it("keeps personal card records independent of shields and market state", () => {
    for (const sealClass of [card.sealClass, null]) {
      const html = renderToStaticMarkup(createElement(TastingCardPresentation, {
        card: { ...card, sealClass }, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false
      }));

      expect(html).toContain(sealClass ? "Documented Tasting" : "Private tasting");
      expect(html).toContain("Anji White Tea");
      expect(html).not.toContain("tasting-card-secret-seal-target");
      expect(html).not.toContain("detachable-seal");
      expect(html).not.toContain("data-seal-state");
      expect(html).not.toContain("Shield card");
      expect(html).not.toContain("Gold Leaves");
    }
  });

  it("renders changed journal values over the supplied artwork instead of a fixed sample", () => {
    const editedCard: JournalCard = {
      ...card,
      teaName: "Moonlight White",
      origin: "Yunnan, China",
      teaType: "White",
      rating: 5,
      intensity: "Lively",
      descriptors: [{ stableId: null, label: "Honey", mapped: false }],
      brewing: { ...card.brewing!, waterTemperatureC: 92, vessel: "Glass pot" }
    };
    const html = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card: editedCard, contextLabel: "Evening session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false
    }));

    expect(html).toContain('/tea-cards/anji-white-tea-front-white.png');
    expect(html).toContain("Moonlight White");
    expect(html).toContain("Yunnan, China");
    expect(html).toContain("★★★★★");
    expect(html).toContain("Honey");
    expect(html).toContain("92 °C");
    expect(html).toContain("Glass pot");
  });

  it("assigns distinct palettes to the supported tea families", () => {
    expect(["Green", "Black", "Oolong", "White", "Yellow", "Red", "Pu-erh", "Herbal"].map(tastingCardTeaTheme))
      .toEqual(["green", "black", "oolong", "white", "yellow", "red", "dark", "herbal"]);
    expect(tastingCardTeaTheme(null)).toBe("classic");
  });

  it("uses compact wrapping styles for long tea names on both card faces", () => {
    const longName = "Bai Mudan – White Peony";
    const html = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card: { ...card, teaName: longName },
      contextLabel: "Personal session",
      earnedAt: "2026-08-03T12:00:00.000Z",
      flipped: false
    }));

    expect(tastingCardTitleLengthClass("Anji White Tea")).toBe("");
    expect(tastingCardTitleLengthClass(longName)).toBe("is-long");
    expect(tastingCardTitleLengthClass("A Very Long Tea Name From a Small Mountain Garden Lot Seven")).toBe("is-long is-extra-long");
    expect(html.match(/is-long/g)).toHaveLength(2);
    expect(html.match(new RegExp(longName, "g"))).toHaveLength(4);
  });

  it("uses compact styles for long brewing method labels", () => {
    const html = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card: { ...card, brewing: { ...card.brewing!, style: "matcha_koicha" } },
      contextLabel: "Personal session",
      earnedAt: "2026-08-03T12:00:00.000Z",
      flipped: true
    }));

    expect(tastingCardStyleLengthClass("Gongfu")).toBe("");
    expect(tastingCardStyleLengthClass("Matcha — koicha")).toBe("is-long");
    expect(tastingCardStyleLengthClass("Hong Kong–style milk tea")).toBe("is-long is-extra-long");
    expect(html).toContain("tasting-card-live-style tasting-card-live-paper is-long");
    expect(html).toContain("Matcha — koicha");
  });

  it("combines every infusion into one back-card data set", () => {
    const data = tastingCardInfusionDataSet([
      { label: "Rinse (optional)", durationSeconds: 5, temperatureC: 80, notes: "Leaf opened" },
      { label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Sweet apricot" },
      { label: "Second wash", durationSeconds: 15, temperatureC: 88, notes: "Floral lift" },
      { label: "Infusion 3", durationSeconds: 20, temperatureC: 90, notes: "Mineral finish" },
      { label: "Infusion 4", durationSeconds: 25, temperatureC: 90, notes: "Soft and lingering" }
    ]);

    expect(data).toEqual({
      recordCount: 4,
      timing: "10 sec–25 sec",
      temperature: "85 °C–90 °C",
      notes: "Sweet apricot · Floral lift · Mineral finish · Soft and lingering"
    });
  });
});
