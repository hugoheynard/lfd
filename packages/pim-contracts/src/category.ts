import { z } from "zod";

import type { LocalizedText, SalesChannels } from "./shared.js";

/**
 * Contrat de fil des **familles** (catégories). Payloads validés côté backend,
 * vue rendue côté API. Les références de TVA sont **nullables** (`null` = non
 * réglé) ; le slug est dérivé du nom côté serveur.
 */
export const createCategoryPayloadSchema = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
  parentId: z.string().optional(),
});
export type CreateCategoryPayload = z.infer<typeof createCategoryPayloadSchema>;

export const renameCategoryPayloadSchema = z.object({
  nameFr: z.string().min(1),
  nameEn: z.string().optional(),
});
export type RenameCategoryPayload = z.infer<typeof renameCategoryPayloadSchema>;

const boutiqueChannelsSchema = z.object({
  emporter: z.boolean(),
  surPlace: z.boolean(),
});

export const setCategoryChannelsPayloadSchema = z.object({
  b1: boutiqueChannelsSchema,
  b2: boutiqueChannelsSchema,
});
export type SetCategoryChannelsPayload = z.infer<typeof setCategoryChannelsPayloadSchema>;

export const setCategoryTvaPayloadSchema = z.object({
  emporterTvaId: z.string().nullable(),
  surPlaceTvaId: z.string().nullable(),
});
export type SetCategoryTvaPayload = z.infer<typeof setCategoryTvaPayloadSchema>;

/** Vue d'une famille telle que l'API la rend. */
export interface CategoryView {
  readonly id: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly parentId: string | null;
  readonly position: number;
  readonly isArchived: boolean;
  readonly channelPreset: SalesChannels;
  readonly emporterTvaId: string | null;
  readonly surPlaceTvaId: string | null;
}
