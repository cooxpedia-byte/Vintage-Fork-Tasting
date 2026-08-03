export type TeaLabCanonicalTeaSelection = {
  kind: "canonical";
  canonicalTeaId: string;
};

export type TeaLabPersonalTeaSelection = {
  kind: "personal";
  personalTeaId: string;
  name: string;
  producer?: string | null;
  origin?: string | null;
  teaType?: string | null;
  cultivar?: string | null;
  harvest?: string | null;
  productIdentifier?: string | null;
  lotCode?: string | null;
};

export type TeaLabTeaSelection = TeaLabCanonicalTeaSelection | TeaLabPersonalTeaSelection;

export const TEA_LAB_BREWING_STYLE_IDS = [
  "western", "tea_bag", "grandpa", "bowl", "gongfu", "chaozhou_gongfu", "sencha_kyusu", "gyokuro",
  "matcha_usucha", "matcha_koicha", "cold_brew", "flash_chilled", "koridashi", "masala_chai", "karak_chai",
  "turkish_cay", "moroccan_mint", "samovar", "kashmiri_kahwa", "hong_kong_milk_tea", "herbal_decoction", "custom"
] as const;

export type TeaLabBrewingStyle = typeof TEA_LAB_BREWING_STYLE_IDS[number];

export type TeaLabBrewStageDraft = {
  label: string;
  durationSeconds?: number | null;
  temperatureC?: number | null;
  notes?: string | null;
};

export type TeaLabBrewingDraft = {
  style?: TeaLabBrewingStyle | null;
  leafGrams?: number | null;
  waterMl?: number | null;
  waterTemperatureC?: number | null;
  waterSource?: string | null;
  vessel?: string | null;
  initialSteepSeconds?: number | null;
  preparationNotes?: string | null;
  stages?: TeaLabBrewStageDraft[];
};

export type TeaLabTastingDraft = {
  firstImpression: string | null;
  descriptorIds: string[];
  intensity: "subtle" | "clear" | "dominant" | null;
  rating: number | null;
  personalNotes: string | null;
};

export type TeaLabDraftStatus = "draft" | "in_progress" | "completion_pending" | "completed";

export type TeaLabSoloDraft = {
  schemaVersion: 1;
  ownerUserId: string;
  sessionId: string;
  cardId: string;
  serverRevision: number;
  status: TeaLabDraftStatus;
  archived: boolean;
  tea: TeaLabTeaSelection | null;
  brewing: TeaLabBrewingDraft;
  tasting: TeaLabTastingDraft;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
};

export type TeaLabOutboxState = "pending" | "syncing" | "authentication" | "conflict" | "failed";
export type TeaLabOperationKind = "save" | "complete" | "archive" | "delete";

type TeaLabOperationBase = {
  schemaVersion: 1;
  id: string;
  ownerUserId: string;
  sessionId: string;
  state: TeaLabOutboxState;
  sequence: number;
  expectedRevision: number | null;
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeaLabSaveOperation = TeaLabOperationBase & {
  kind: "save";
  payload: {
    cardId: string;
    tea: TeaLabTeaSelection;
    brewing: TeaLabBrewingDraft;
    tasting: TeaLabTastingDraft;
  };
};

export type TeaLabCompleteOperation = TeaLabOperationBase & {
  kind: "complete";
  payload: null;
};

export type TeaLabArchiveOperation = TeaLabOperationBase & {
  kind: "archive";
  payload: { archived: boolean };
};

export type TeaLabDeleteOperation = TeaLabOperationBase & {
  kind: "delete";
  payload: null;
};

export type TeaLabOutboxOperation =
  | TeaLabSaveOperation
  | TeaLabCompleteOperation
  | TeaLabArchiveOperation
  | TeaLabDeleteOperation;

export type TeaLabSaveIndicator = {
  state: "saved" | "saving" | "device" | "authentication" | "attention";
  label: string;
};

type IdFactory = () => string;
type Clock = () => string;

const defaultIdFactory: IdFactory = () => crypto.randomUUID();
const defaultClock: Clock = () => new Date().toISOString();

export function createSoloTeaDraft(
  ownerUserId: string,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
): TeaLabSoloDraft {
  if (!ownerUserId) throw new Error("Tea Lab drafts require an owner namespace.");
  const now = clock();

  return {
    schemaVersion: 1,
    ownerUserId,
    sessionId: idFactory(),
    cardId: idFactory(),
    serverRevision: 0,
    status: "draft",
    archived: false,
    tea: null,
    brewing: {},
    tasting: {
      firstImpression: null,
      descriptorIds: [],
      intensity: null,
      rating: null,
      personalNotes: null
    },
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null
  };
}

export function createTeaLabOperationBase(
  draft: TeaLabSoloDraft,
  sequence = 1,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
): TeaLabOperationBase {
  const now = clock();
  return {
    schemaVersion: 1,
    id: idFactory(),
    ownerUserId: draft.ownerUserId,
    sessionId: draft.sessionId,
    state: "pending",
    sequence,
    expectedRevision: null,
    attempts: 0,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now
  };
}

export function resolveTeaLabSaveIndicator(operations: TeaLabOutboxOperation[], online: boolean): TeaLabSaveIndicator {
  if (operations.some(operation => operation.state === "conflict" || operation.state === "failed")) {
    return { state: "attention", label: "Saved on this device. Review the sync issue before continuing." };
  }
  if (operations.some(operation => operation.state === "authentication")) {
    return { state: "authentication", label: "Saved on this device. Sign in to finish syncing." };
  }
  if (operations.some(operation => operation.state === "syncing")) {
    return { state: "saving", label: "Saving…" };
  }
  if (operations.length > 0 || !online) {
    return { state: "device", label: "Saved on this device. We’ll sync when you’re connected." };
  }
  return { state: "saved", label: "Saved." };
}
