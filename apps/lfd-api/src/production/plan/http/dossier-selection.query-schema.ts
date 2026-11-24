import { z } from "zod";

import {
  DOSSIER_PARTS,
  type DossierPart,
  type DossierSelection,
} from "../domain/services/day-dossier-selection.js";

/**
 * **La sélection d'un tirage du dossier, lue dans l'URL** — la forme
 * seulement ; que la commande ou le rayon soit au dossier, c'est le domaine
 * qui le dit (`DossierSelectionUnknownError`).
 *
 * - `parts` et `orders` : une liste séparée par des virgules, ou le
 *   paramètre répété (`?orders=a&orders=b`) — un identifiant ne porte pas de
 *   virgule ;
 * - `groups` : le paramètre **répété** seulement, sans découpe : un libellé
 *   de rayon est un nom écrit au référentiel, et peut en porter une.
 *
 * Un paramètre absent vaut « tout » ; présent mais vide, il est refusé — une
 * fenêtre qui n'a rien coché n'a rien à imprimer.
 */
const listed = z
  .union([z.string(), z.array(z.string())])
  .transform((raw) => (Array.isArray(raw) ? raw : [raw]));

const commaListed = listed
  .transform((values) =>
    values
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value !== ""),
  )
  .pipe(z.array(z.string()).min(1, "la liste ne peut pas être vide"));

const partSchema = z.enum(DOSSIER_PARTS);

export const dossierSelectionQuerySchema = z.object({
  parts: commaListed.pipe(z.array(partSchema)).optional(),
  groups: listed
    .transform((values) => values.filter((value) => value.trim() !== ""))
    .pipe(z.array(z.string()).min(1, "la liste ne peut pas être vide"))
    .optional(),
  orders: commaListed.optional(),
});

export type DossierSelectionQuery = z.infer<typeof dossierSelectionQuerySchema>;

/** La sélection du domaine : un paramètre absent vaut « tout ». */
export function dossierSelectionOf(query: DossierSelectionQuery): DossierSelection {
  return {
    parts: new Set<DossierPart>(query.parts ?? DOSSIER_PARTS),
    groups: query.groups === undefined ? "all" : new Set(query.groups),
    orders: query.orders === undefined ? "all" : new Set(query.orders),
  };
}
