import { z } from "zod";

export const eventSchema = z.object({
  title: z.string().trim().min(3).max(80),
  startsAt: z.string().datetime(),
  locationMode: z.enum(["remote", "in_person"]),
  capacity: z.coerce.number().int().min(1).max(100),
  venueName: z.string().trim().max(120).optional().nullable(),
  venueAddress: z.string().trim().max(240).optional().nullable(),
  videoCallUrl: z.string().url().optional().nullable(),
  hostUserId: z.string().uuid(),
  backupHostUserId: z.string().uuid().optional().nullable()
}).superRefine((value, ctx) => {
  if (value.locationMode === "remote" && !value.videoCallUrl) {
    ctx.addIssue({ code: "custom", path: ["videoCallUrl"], message: "A video-call link is required." });
  }
  if (value.locationMode === "in_person" && (!value.venueName || !value.venueAddress)) {
    ctx.addIssue({ code: "custom", path: ["venueName"], message: "Venue name and address are required." });
  }
  if (value.backupHostUserId && value.backupHostUserId === value.hostUserId) {
    ctx.addIssue({ code: "custom", path: ["backupHostUserId"], message: "Backup host must be different from host." });
  }
});

export const joinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(64),
  displayName: z.string().trim().min(1).max(40),
  email: z.string().trim().email().optional().or(z.literal("")),
  marketingConsent: z.boolean().nullable().optional()
});

export const responseSchema = z.object({
  flightItemId: z.string().uuid(),
  firstImpression: z.string().max(600).nullable().optional(),
  descriptors: z.array(z.string().max(40)).max(5),
  intensity: z.enum(["subtle", "clear", "dominant"]).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  personalNotes: z.string().max(3000).nullable().optional(),
  saved: z.boolean().optional(),
  completed: z.boolean().optional()
});

export const guestNotesSchema = z.object({
  flightItemId: z.string().uuid(),
  personalNotes: z.string().max(3000)
});

export const recapEmailSchema = z.object({
  email: z.string().trim().email().max(254).optional()
});

export const guestDeletionSchema = z.object({
  deletionToken: z.string().min(32).max(256).optional()
});

export const savedTeaSchema = z.object({
  flightItemId: z.string().uuid(),
  saved: z.boolean()
});
