import { z } from "zod";

import { count, fact, payload, subjectLabel } from "./fact.js";

/** Le numéro d'une table, de 1 à N. */
const table = (): z.ZodType => z.number().int().min(1);

/**
 * **La grille de tables d'un site** (Hugo, 2026-10-17, plan
 * `documentation/sites/plan-sur-place-capacite-de-site.md`, L2).
 *
 * Le sujet reste `pickup_address`, comme tous les faits du site : une valeur
 * n'est pas un nom. Le NUMÉRO de table, jamais le jeton : il vaut accès à la
 * table, et un journal se relit plus largement que la grille.
 */
export const SITE_TABLE_FACTS = {
  /** Le nombre de tables, avant et après : en retirer efface leurs QR. */
  "pickup_address.tables_set": fact(
    payload({ subjectLabel: subjectLabel(), count: count(), before: count() }),
  ),
  /** Un QR (re)généré : l'ancien code imprimé de cette table ne vaut plus. */
  "pickup_address.table_qr_generated": fact(
    payload({ subjectLabel: subjectLabel(), table: table() }),
  ),
  /** Un QR retiré : le code imprimé de cette table ne vaut plus. */
  "pickup_address.table_qr_removed": fact(
    payload({ subjectLabel: subjectLabel(), table: table() }),
  ),
};
