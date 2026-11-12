import { z } from "zod";

import { DAY_JOURNALS, type DayJournal, isDayJournal, serviceDaySchema } from "./day-version.js";

/**
 * Contrat de fil de **la porte des versions**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 2.3) :
 * `GET admin/versions?date=AAAA-MM-JJ&subjects=orders,companies`.
 *
 * Un sujet a un numéro ; un écran ne se relit que si le numéro d'un sujet
 * qu'il suit a CHANGÉ. Deux portées :
 *
 * - **journalière** — les journaux de journée ({@link DAY_JOURNALS}), dont le
 *   numéro dépend d'une journée de service, d'où la `date` ;
 * - **globale** — un numéro pour tout le back-office, sans date.
 *
 * Chaque sujet garde SON droit : un sujet que l'appelant ne peut pas lire est
 * ABSENT de la réponse, sans refuser les autres.
 */

/**
 * Les sujets globaux :
 *
 * - `companies` — les comptes clients (`public.company_change`), sous
 *   `b2b_companies:read` ;
 * - `orders-all` — toutes les commandes, quelle que soit leur journée
 *   (`public.order_change`), sous `b2b_orders:read` seul ;
 * - `catalog-admin` — l'écran Catalogue du back-office
 *   (`public.catalog_admin_change`), sous `lfc_catalog:read` ;
 * - `pim` — le référentiel (`pim.pim_change`), sous `pim_catalog:read`,
 *   `pim_tax:read`, `pim_settings:read` ou `allergen_matrix:read` : le numéro
 *   ne dit qu'« un changement a eu lieu », chaque contenu garde sa route.
 */
export const GLOBAL_VERSION_SUBJECTS = ["companies", "orders-all", "catalog-admin", "pim"] as const;
export type GlobalVersionSubject = (typeof GLOBAL_VERSION_SUBJECTS)[number];

/** Tous les sujets du fil : les journaux de journée, puis les sujets globaux. */
export const VERSION_SUBJECTS = [...DAY_JOURNALS, ...GLOBAL_VERSION_SUBJECTS] as const;
export type VersionSubject = DayJournal | GlobalVersionSubject;

const GLOBAL_SUBJECT_SET: ReadonlySet<string> = new Set(GLOBAL_VERSION_SUBJECTS);

/** Vrai si la chaîne nomme un sujet global. */
export function isGlobalVersionSubject(value: string): value is GlobalVersionSubject {
  return GLOBAL_SUBJECT_SET.has(value);
}

/** Vrai si la chaîne nomme un sujet connu du fil, de l'une ou l'autre portée. */
export function isVersionSubject(value: string): value is VersionSubject {
  return isDayJournal(value) || isGlobalVersionSubject(value);
}

/**
 * La liste des sujets, séparés par des virgules, sans doublon. Un nom inconnu
 * est refusé EN SE NOMMANT : une faute de frappe dans un écran ne doit pas
 * devenir un numéro qu'on ne reçoit jamais, en silence.
 */
const subjectListSchema = z
  .string()
  .transform((raw) => raw.split(",").map((name) => name.trim()))
  .superRefine((names, ctx) => {
    const unknown = names.filter((name) => !isVersionSubject(name));
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `sujet inconnu : « ${unknown.join(" », « ")} » — sujets connus : ${VERSION_SUBJECTS.join(", ")}`,
      });
    }
  })
  .transform((names) => [...new Set(names.filter(isVersionSubject))]);

/**
 * `date` n'est exigée que si un sujet journalier est demandé : un écran qui
 * ne suit que des sujets globaux n'a pas de journée à nommer.
 */
export const versionsQuerySchema = z
  .object({
    date: serviceDaySchema.optional(),
    subjects: subjectListSchema,
  })
  .superRefine((query, ctx) => {
    const daily = query.subjects.filter(isDayJournal);
    if (daily.length > 0 && query.date === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: `date AAAA-MM-JJ attendue pour les sujets journaliers : « ${daily.join(" », « ")} »`,
      });
    }
  });
export type VersionsQuery = z.infer<typeof versionsQuerySchema>;

/**
 * Les numéros des sujets demandés ET permis. `date` est celle de la question,
 * `null` si elle n'en portait pas.
 *
 * 🔴 **Un numéro se compare par ÉGALITÉ, jamais par ordre.** Un journal
 * balayé après sept jours rend `0` : le numéro peut redescendre, et un écran
 * qui ne relirait que sur « plus grand » manquerait ce cas.
 */
export const versionsViewSchema = z.object({
  date: z.string().nullable(),
  versions: z.partialRecord(z.enum(VERSION_SUBJECTS), z.number().int().nonnegative()),
});
export type VersionsView = z.infer<typeof versionsViewSchema>;
