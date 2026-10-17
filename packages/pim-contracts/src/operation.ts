import { z } from "zod";

/**
 * **La clientèle** — `pro`, `public` ou `both` : à qui une famille ou une
 * fiche se vend (l'audience du catalogue).
 *
 * Ce fichier portait aussi le contrat des opérations datées du référentiel
 * (préparer, composer, archiver, et leur vue). Les opérations s'écrivent au
 * commerce (`@lfd/contracts`, `commerce-operations.ts`) ; leur code au
 * référentiel est parti en X4 (`documentation/catalogue/plan-sans-interrupteurs.md`).
 * Reste le vocabulaire de la clientèle, que l'audience a repris tel quel.
 */
export const OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type OperationAudience = (typeof OPERATION_AUDIENCES)[number];
export const operationAudienceSchema = z.enum(OPERATION_AUDIENCES);
