import { z } from "zod";

/**
 * Contrat de fil de la **version par journée**
 * (`documentation/caching-usage/plan-version-par-journee.md`).
 *
 * Deux routes le servent, une par journal, parce qu'il y a deux journaux — un
 * par schéma (D3) :
 *
 * - `GET admin/supervision/version?date=` — le commerce, `b2b_supervision:read` ;
 * - `GET admin/production/version?date=` — le fournil, `b2b_orders:read`.
 *
 * Un écran ne relit sa journée que si la version a CHANGÉ depuis sa dernière
 * lecture. Rien de plus : la version ne dit pas ce qui a bougé.
 */

/** La journée de SERVICE dont on veut la version, `AAAA-MM-JJ`. Obligatoire. */
export const dayVersionQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type DayVersionQuery = z.infer<typeof dayVersionQuerySchema>;

/**
 * La version d'une journée dans UN journal.
 *
 * 🔴 **Se compare par ÉGALITÉ, jamais par ordre.** `0` dit « aucune écriture
 * connue » — journée jamais touchée, ou dont les traces ont été balayées après
 * sept jours. Un balayage peut donc faire REDESCENDRE la version d'une journée
 * ancienne ; un écran qui ne relirait que sur « plus grand » manquerait ce cas.
 */
export const dayVersionViewSchema = z.object({
  date: z.string(),
  version: z.number().int().nonnegative(),
});
export type DayVersionView = z.infer<typeof dayVersionViewSchema>;
