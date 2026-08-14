import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DetachableTastingSeal, isSecretSealDoubleTap, PhotoSlider, TastingCardPresentation, tastingCardInfusionDataSet, tastingCardStyleLengthClass, tastingCardTeaTheme, tastingCardTitleLengthClass } from "@/components/tea-lab/TastingCardDialog";
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
    expect(front).toContain('/tea-cards/detachable-seal-coin.png');
    expect(front).toContain('data-seal-state="decoupled"');
    expect(front).toContain("tasting-card-secret-seal-target");
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

  it("couples and decouples the ornate seal independently of the card artwork", () => {
    const coupled = renderToStaticMarkup(createElement(DetachableTastingSeal, { attached: true }));
    const decoupled = renderToStaticMarkup(createElement(DetachableTastingSeal, { attached: false }));
    const privateCard = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card: { ...card, sealClass: null }, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false
    }));

    expect(coupled).toContain('data-seal-state="coupled"');
    expect(coupled).toContain("is-attached");
    expect(decoupled).toContain('data-seal-state="decoupled"');
    expect(decoupled).toContain("is-detached");
    expect(privateCard).toContain('data-seal-state="decoupled"');
    expect(privateCard).toContain("Private tasting");
    expect(privateCard).not.toContain("tasting-card-secret-seal-target");
  });

  it("renders the seal from the controlled Tea Merchant shield state", () => {
    const shielded = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false, shielded: true
    }));
    const deshielded = renderToStaticMarkup(createElement(TastingCardPresentation, {
      card, contextLabel: "Personal session", earnedAt: "2026-08-03T12:00:00.000Z", flipped: false, shielded: false
    }));

    expect(shielded).toContain('data-seal-state="coupled"');
    expect(deshielded).toContain('data-seal-state="decoupled"');
  });

  it("recognizes the hidden shield gesture only when two taps are close together", () => {
    expect(isSecretSealDoubleTap(null, 1_000)).toBe(false);
    expect(isSecretSealDoubleTap(1_000, 1_450)).toBe(true);
    expect(isSecretSealDoubleTap(1_000, 1_451)).toBe(false);
    expect(isSecretSealDoubleTap(1_000, 999)).toBe(false);
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
