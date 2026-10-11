import { z } from "zod";

import { UPLOAD_FAILURES_MAX } from "../application/read-upload-failures.js";

/*
 * **Les paramètres de requête de la médiathèque** — la forme et les bornes,
 * rien de plus (2026-10-11). Ils étaient lus en chaînes nues : un `limit`
 * illisible retombait en silence sur le défaut, et un paramètre répété
 * arrivait au handler sous forme de tableau.
 *
 * Absents, ils restent permis : le handler en fait un 404 nommé (une URL
 * vide n'est au fonds de personne), ou une liste vide pour les porteurs.
 */

/** Une URL d'image tient largement là-dedans ; au-delà, ce n'en est pas une. */
const URL_MAX = 2048;
/** Un mot-clé brut, avant que le domaine le coupe à sa propre borne. */
const RAW_TAG_MAX = 200;

export const failuresQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(UPLOAD_FAILURES_MAX).optional(),
});
export type FailuresQuery = z.infer<typeof failuresQuerySchema>;

export const imageUrlQuerySchema = z.object({
  url: z.string().max(URL_MAX).optional(),
});
export type ImageUrlQuery = z.infer<typeof imageUrlQuerySchema>;

export const tagQuerySchema = z.object({
  tag: z.string().max(RAW_TAG_MAX).optional(),
});
export type TagQuery = z.infer<typeof tagQuerySchema>;
