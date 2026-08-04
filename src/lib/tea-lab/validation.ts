import { z } from "zod";
import { TEA_LAB_BREWING_STYLE_IDS } from "@/lib/tea-lab/offline";

const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable().optional();

const canonicalTeaSchema = z.object({
  kind: z.literal("canonical"),
  canonicalTeaId: z.string().uuid()
}).strict();

const personalTeaSchema = z.object({
  kind: z.literal("personal"),
  personalTeaId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  producer: optionalText(160),
  origin: optionalText(160),
  teaType: optionalText(80),
  cultivar: optionalText(120),
  harvest: optionalText(120),
  productIdentifier: optionalText(160),
  lotCode: optionalText(160)
}).strict();

const brewStageSchema = z.object({
  label: z.string().trim().min(1).max(80),
  durationSeconds: z.number().int().min(1).max(86400).nullable().optional(),
  temperatureC: z.number().finite().min(0).max(100).nullable().optional(),
  notes: optionalText(600)
}).strict();

export const soloSessionSaveSchema = z.object({
  operationId: z.string().uuid(),
  cardId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  tea: z.discriminatedUnion("kind", [canonicalTeaSchema, personalTeaSchema]),
  brewing: z.object({
    style: z.enum(TEA_LAB_BREWING_STYLE_IDS).nullable().optional(),
    leafGrams: z.number().finite().positive().max(1000).nullable().optional(),
    waterMl: z.number().int().min(1).max(10000).nullable().optional(),
    waterTemperatureC: z.number().finite().min(0).max(100).nullable().optional(),
    waterSource: optionalText(160),
    vessel: optionalText(160),
    initialSteepSeconds: z.number().int().min(1).max(86400).nullable().optional(),
    preparationNotes: optionalText(1200),
    stages: z.array(brewStageSchema).max(20).optional()
  }).strict().default({}),
  tasting: z.object({
    firstImpression: z.string().max(600).nullable().default(null),
    descriptorIds: z.array(z.string().uuid()).max(5).default([]),
    intensity: z.enum(["subtle", "clear", "dominant"]).nullable().default(null),
    rating: z.number().int().min(1).max(5).nullable().default(null),
    personalNotes: z.string().max(3000).nullable().default(null)
  }).strict()
}).strict();

export const soloSessionCompletionSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.number().int().min(1)
}).strict();

export const soloSessionArchiveSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  archived: z.boolean()
}).strict();

export const soloSessionDeletionSchema = z.object({
  operationId: z.string().uuid()
}).strict();

export const soloSessionParamsSchema = z.object({
  sessionId: z.string().uuid()
}).strict();

export const personalTeaParamsSchema = z.object({
  teaId: z.string().uuid()
}).strict();

export const personalTeaArchiveSchema = z.object({
  operationId: z.string().uuid(),
  archived: z.boolean()
}).strict();

export const tastingPhotoPrepareSchema = z.object({
  cardId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(8 * 1024 * 1024)
}).strict();

export const tastingPhotoConfirmSchema = z.object({
  photoId: z.string().uuid()
}).strict();

export const tastingPhotoParamsSchema = z.object({
  photoId: z.string().uuid()
}).strict();
