import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";
import { TeaLabCardEditor } from "@/components/tea-lab/TeaLabCardEditor";
import { soloJournalSessionToDraft, type JournalSession } from "@/lib/tea-lab/journal";
import type { TeaLibraryItem } from "@/lib/tea-lab/library";
import type { PassportSeal } from "@/lib/tea-lab/passport";
import type { MerchantCard } from "@/lib/loyalty";

const personalTea: TeaLibraryItem = {
  id: "personal:personal-1", kind: "personal", canonicalTeaId: null, personalTeaId: "personal-1", name: "Moonlight White",
  producer: null, origin: "Yunnan", teaType: "White", cultivar: null, harvest: "Spring 2026", productIdentifier: null,
  lotCode: "Lot 7", savedReferences: 0, documentedTastings: 2, archivedAt: null, updatedAt: "2026-08-03T12:00:00.000Z"
};

const seals: PassportSeal[] = [
  { id: "documented_tasting:card-1", sealClass: "documented_tasting", label: "Documented Tasting", source: "solo", sourceId: "card-1", teaName: "Moonlight White", origin: "Yunnan", earnedAt: "2026-08-03T12:00:00.000Z", contextLabel: "Personal session", archived: false },
  { id: "live_event_verified:response-1", sealClass: "live_event_verified", label: "Live Event Verified", source: "live", sourceId: "response-1", teaName: "Golden Yunnan", origin: "Yunnan", earnedAt: "2026-08-02T12:00:00.000Z", contextLabel: "In person", archived: false }
];

const merchantCard: MerchantCard = {
  cardId: "card-1",
  teaName: "Moonlight White",
  teaCategory: "White",
  origin: "Yunnan",
  producer: "",
  cardTier: "polychrome",
  tastingCount: 2,
  listingEligible: true,
  pricingSource: "flat_rate",
  pricePerKiloCents: null,
  leafPrice: 1,
  listingId: null,
  listingStatus: null,
  studyCount: 0,
  leavesEarned: 0,
  preview: {}
};

const soloSession: JournalSession = {
  id: "solo-session:session-1", source: "solo", sourceId: "session-1", title: "Solo tasting",
  occurredAt: "2026-08-03T11:00:00.000Z", completedAt: "2026-08-03T12:00:00.000Z", archivedAt: null,
  revision: 2, status: "completed", contextLabel: "Personal session",
  cards: [{
    id: "solo:card-1", source: "solo", sourceId: "card-1", canonicalTeaId: null, personalTeaId: "personal-1", teaName: "Moonlight White", origin: "Yunnan", rating: 4,
    intensity: "clear", descriptors: [], firstImpression: "Soft", personalNotes: "Private", completedAt: "2026-08-03T12:00:00.000Z",
    saved: false, position: 1, sealClass: "documented_tasting",
    brewing: {
      style: "gongfu", leafGrams: 5, waterMl: 100, waterTemperatureC: 85, waterSource: "Filtered", vessel: "Gaiwan",
      initialSteepSeconds: 10, instructions: null, preparationNotes: null,
      stages: [{ label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Soft apricot" }]
    }
  }]
};

function render(section: "journal" | "passport" | "saved" | "merchant", extras: Partial<Parameters<typeof CustomerDashboard>[0]>) {
  return renderToStaticMarkup(createElement(CustomerDashboard, {
    name: "Alex", ownerUserId: "owner-1", events: [], initialTab: section, teaLabEnabled: true, ...extras
  }));
}

describe("Tea Lab customer assets", () => {
  it("renders private and saved-source Library semantics", () => {
    const html = render("saved", { libraryItems: [personalTea] });

    expect(html).toContain("Your Tea Library");
    expect(html).toContain("Moonlight White");
    expect(html).toContain("Lot 7");
    expect(html).toContain("2 documented tastings");
    expect(html).toContain("Archive from Library");
  });

  it("renders visibly distinct source-qualified Passport seals", () => {
    const html = render("passport", { passportSeals: seals });

    expect(html).toContain("Tea Cellar");
    expect(html).toContain("Tea Merchant");
    expect(html).toContain("Open Tea Merchant");
    expect(html).not.toContain(">Passport<");
    expect(html).toContain("Your Tea Cellar");
    expect(html).toContain("Live Event Verified");
    expect(html).toContain("Documented Tasting");
    expect(html).toContain("live_event_verified");
    expect(html).toContain("documented_tasting");
    expect(html).toContain("Tap to view card");
    expect(html).toContain("Open tasting card for Moonlight White");
  });

  it("opens Tea Merchant as a Tea Cellar subview", () => {
    const html = render("merchant", { passportSeals: seals, merchantCards: [merchantCard] });
    expect(html).toContain("Connected to your Vintage Fork account");
    expect(html).toContain("Tea Merchant");
    expect(html).toContain("Return to Tea Cellar");
    expect(html).toContain("Your Tea Cellar card tray");
    expect(html).toContain("tea-merchant-tray");
    expect(html).toContain("tasting-card-artwork-image");
    expect(html).toContain("Moonlight White");
    expect(html).toContain("Golden Yunnan");
    expect(html).toContain("Show brewing details for Moonlight White");
    expect(html).toContain("Select for market");
    expect(html).toContain("Ready to list");
    expect(html).toContain("Tap a card to flip it");
    expect(html).toContain("Double-tap its shield");
    expect(html).not.toContain("Open tasting card for Moonlight White");
    expect(html).not.toContain("Deshield card");
    expect(html).not.toContain("My Stall");
    expect(html).toContain("Study Copy Market");
    expect(html).not.toContain("Run market day");
    expect(html).not.toContain("Starter card");
  });

  it("keeps Tea Merchant empty until a real Tea Cellar card exists", () => {
    const html = render("merchant", { passportSeals: [] });

    expect(html).toContain("No tasting cards yet.");
    expect(html).toContain("Every completed tasting card that appears in Tea Cellar will also appear here.");
    expect(html).not.toContain("Cream Oolong");
    expect(html).not.toContain("Run market day");
  });

  it("offers editing, archive, and guarded permanent deletion only for owned solo sessions", () => {
    const archived = { ...soloSession, id: "solo-session:archived", sourceId: "archived", archivedAt: "2026-08-04T12:00:00.000Z", revision: 3 };
    const html = render("journal", { journalSessions: [soloSession], archivedJournalSessions: [archived] });

    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Archive</button>");
    expect(html).toContain(">Delete</button>");
    expect(html).toContain("btn btn-secondary journal-session-action-archive");
    expect(html).toContain("btn btn-danger journal-session-action-delete");
    expect(html).toContain("Swipe left for actions");
    expect(html).toContain("journal-session-swipe-row");
    expect(html).toContain("journal-session-action-rail");
    expect(html).toContain("Show archived tastings (1)");
    expect(html).toContain("View card");
    expect(html).toContain("View tasting card for Moonlight White");
    expect(html).toContain("journal-desktop-table");
    expect(html).toContain("journal-mobile-tea-list");
    expect(html).toContain("journal-mobile-tea-card");
    expect(html).not.toContain(">Intensity</th>");
    expect(html).not.toContain(">Your descriptors</th>");
    expect(html).not.toContain(">Intensity</span>");
    expect(html).not.toContain(">Your descriptors</span>");
    expect(html).not.toContain("Restore tasting");
  });

  it("renders the completed-card editor with tasting, brewing, and Passport safeguards", () => {
    const draft = soloJournalSessionToDraft("owner-1", soloSession);
    const html = renderToStaticMarkup(createElement(TeaLabCardEditor, {
      draft,
      descriptorOptions: [],
      busy: false,
      onChange: vi.fn(),
      onCancel: vi.fn(),
      onSave: vi.fn()
    }));

    expect(html).toContain("Edit tasting card");
    expect(html).toContain("Tea details");
    expect(html).toContain("Rating and intensity");
    expect(html).toContain("Flavour descriptors");
    expect(html).toContain("Brewing record");
    expect(html).toContain("Brew stages");
    expect(html).toMatch(/id="edit-stage-time-card-1-0" type="range" min="0" max="60"/);
    expect(html).toMatch(/id="edit-stage-temp-card-1-0" type="range" min="0" max="100"/);
    expect(html).toContain("Infusion time unit");
    expect(html).toContain(">+ Add infusion</button>");
    expect(html).toContain("Passport stays intact.");
    expect(html).toContain("Save card");

    const matchaHtml = renderToStaticMarkup(createElement(TeaLabCardEditor, {
      draft: { ...draft, brewing: { ...draft.brewing, style: "matcha_koicha" } },
      descriptorOptions: [],
      busy: false,
      onChange: vi.fn(),
      onCancel: vi.fn(),
      onSave: vi.fn()
    }));
    expect(matchaHtml).toContain(">+ Add infusion</button>");
    expect(matchaHtml).toContain("Up to 20");
  });
});
