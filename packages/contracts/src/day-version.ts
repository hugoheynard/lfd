import { z } from "zod";

/**
 * Contrat de fil de la **version par journée**
 * (`documentation/caching-usage/plan-version-par-journee.md`).
 *
 * 🔴 **Une seule porte** depuis le 2026-11-03 (décision de Hugo, D8 du plan) :
 * `GET admin/day-versions?date=AAAA-MM-JJ&journals=orders,production`. Les six
 * routes par journal sont retirées ; chaque journal garde SON droit, et un
 * journal que l'appelant n'a pas le droit de lire est ABSENT de la réponse.
 *
 * Un écran ne relit sa journée que si une version a CHANGÉ depuis sa dernière
 * lecture. Rien de plus : la version ne dit pas ce qui a bougé.
 */

/**
 * Les journaux qu'un écran peut suivre — les noms du fil. Chacun a exactement
 * UNE source côté API (le registre `DayVersionRegistry` refuse de démarrer
 * sinon) :
 *
 * - `orders` — le journal du commerce (`public.day_change`) ;
 * - `production` — le fournil et son colisage (somme des deux journaux) ;
 * - `delivery` — la livraison (`delivery.day_change`) ;
 * - `my-round` — « ma tournée » du livreur, livraison et commerce mêlés.
 */
export const DAY_JOURNALS = ["orders", "production", "delivery", "my-round"] as const;
export type DayJournal = (typeof DAY_JOURNALS)[number];

const DAY_JOURNAL_SET: ReadonlySet<string> = new Set(DAY_JOURNALS);

/** Vrai si la chaîne nomme un journal connu du fil. */
export function isDayJournal(value: string): value is DayJournal {
  return DAY_JOURNAL_SET.has(value);
}

/** La journée de SERVICE, `AAAA-MM-JJ`. */
const serviceDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ");

/**
 * La liste des journaux, séparés par des virgules, sans doublon. Un nom
 * inconnu est refusé EN SE NOMMANT : une faute de frappe dans un écran ne doit
 * pas devenir une version qu'on ne reçoit jamais, en silence.
 */
const journalListSchema = z
  .string()
  .transform((raw) => raw.split(",").map((name) => name.trim()))
  .superRefine((names, ctx) => {
    const unknown = names.filter((name) => !isDayJournal(name));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `journal inconnu : « ${unknown.join(" », « ")} » — journaux connus : ${DAY_JOURNALS.join(", ")}`,
      });
    }
  })
  .transform((names) => [...new Set(names.filter(isDayJournal))]);

export const dayVersionsQuerySchema = z.object({
  date: serviceDaySchema,
  journals: journalListSchema,
});
export type DayVersionsQuery = z.infer<typeof dayVersionsQuerySchema>;

/**
 * Les versions d'une journée, par journal demandé ET permis.
 *
 * 🔴 **Chaque version se compare par ÉGALITÉ, jamais par ordre.** `0` dit
 * « aucune écriture connue » — journée jamais touchée, ou dont les traces ont
 * été balayées après sept jours. Un balayage peut donc faire REDESCENDRE la
 * version d'une journée ancienne ; un écran qui ne relirait que sur « plus
 * grand » manquerait ce cas.
 *
 * Un journal demandé que l'appelant n'a pas le droit de lire est **absent** :
 * l'écran ne le suit pas, sans que les autres journaux en pâtissent.
 */
export const dayVersionsViewSchema = z.object({
  date: z.string(),
  versions: z.partialRecord(z.enum(DAY_JOURNALS), z.number().int().nonnegative()),
});
export type DayVersionsView = z.infer<typeof dayVersionsViewSchema>;
