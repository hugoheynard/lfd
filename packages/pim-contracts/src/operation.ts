import { z } from "zod";

/**
 * **La clientèle** — `pro`, `public` ou `both` : à qui une famille ou une
 * fiche se vend (l'audience du catalogue).
 *
 * Ce fichier portait aussi le contrat des opérations datées du référentiel
 * (préparer, composer, archiver, et leur vue). Les opérations s'écrivent au
 * commerce (`@lfd/contracts`, `commerce-operations.ts`) ; leur code au
 * référentiel est parti en X4 (`documentation/catalogue/catalogue-synchronise.md` §6).
 * Reste le vocabulaire de la clientèle, que l'audience a repris tel quel.
 */
export const OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type OperationAudience = (typeof OPERATION_AUDIENCES)[number];
export const operationAudienceSchema = z.enum(OPERATION_AUDIENCES);

/**
 * **L'audience du catalogue** — à qui une famille ou une fiche se vend : les
 * trois clientèles, plus `resupply`, qui ne se vend à personne et se commande
 * seulement en réassort des boutiques
 * (`documentation/reassort-boutiques/plan-articles-de-reassort.md`).
 *
 * Une opération commerciale ne vise jamais le réassort : elle garde
 * `OPERATION_AUDIENCES`.
 */
export const CATALOGUE_AUDIENCES = [...OPERATION_AUDIENCES, "resupply"] as const;
export type CatalogueAudience = (typeof CATALOGUE_AUDIENCES)[number];
export const catalogueAudienceSchema = z.enum(CATALOGUE_AUDIENCES);
