import { z } from "zod";

/**
 * Contrat de fil du contexte **locations** — les emplacements (boutiques) et leur
 * grille de tables click & collect. Le token QR d'une table est **minté par le
 * serveur** : jamais dans un payload.
 */

/** Borne dure du nombre de tables (miroir de `MAX_TABLES` côté domaine backend). */
export const MAX_TABLES = 200;

const tableCountSchema = z.number().int().min(0).max(MAX_TABLES);

export const createLocationPayloadSchema = z.object({
  name: z.string().min(1),
  clickCollect: z.boolean(),
  surPlace: z.boolean(),
  baseUrl: z.string(),
  tableCount: tableCountSchema,
});
export type CreateLocationPayload = z.infer<typeof createLocationPayloadSchema>;

export const updateLocationPayloadSchema = z.object({
  name: z.string().min(1).optional(),
  clickCollect: z.boolean().optional(),
  surPlace: z.boolean().optional(),
  baseUrl: z.string().optional(),
  tableCount: tableCountSchema.optional(),
});
export type UpdateLocationPayload = z.infer<typeof updateLocationPayloadSchema>;

/** Vue d'une table : `number` verrouillé, `token` présent une fois le QR généré. */
export interface TableView {
  readonly number: number;
  readonly qrCreated: boolean;
  readonly token: string | null;
}

/** Vue d'un emplacement telle que l'API la rend. */
export interface LocationView {
  readonly id: string;
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tables: readonly TableView[];
  /**
   * Combien de **familles** cochent cet location dans leurs canaux.
   *
   * Voyage avec la vue pour que l'écran le DISE avant le clic : le référentiel
   * refuse de supprimer un point de vente encore vendeur, et un bouton dont on
   * sait qu'il échouera n'a pas à être offert. Même raison que le compte de
   * fiches sur une famille.
   */
  readonly usedByCategories: number;
}

/** Réponse de génération de QR : le token neuf minté par le serveur. */
export interface TableQrResponse {
  readonly token: string;
}
