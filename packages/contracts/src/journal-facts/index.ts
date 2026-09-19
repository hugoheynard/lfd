import { ACCOUNTING_FACTS } from "./accounting.js";
import { ACCOUNTS_AND_CARTS_FACTS } from "./accounts.js";
import { COMMERCE_FACTS } from "./commerce.js";
import type { JournalFactEntry, JournalFactFamily } from "./fact.js";
import { ORDERS_PRODUCTION_FACTS } from "./orders-production.js";
import { PRICING_FACTS } from "./pricing.js";
import { REFERENTIAL_CATALOGUE_FACTS } from "./referential-catalogue.js";
import { REFERENTIAL_SETTINGS_FACTS } from "./referential-settings.js";
import { TEAM_FACTS } from "./team.js";

/**
 * **Le catalogue des faits du journal d'activité** — l'entrée
 * `@lfd/contracts/journal-facts`.
 *
 * Chaque type écrit dans `growth.activity_events`, avec le schéma de sa
 * charge. C'est **la** liste (D1 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`) : les constantes
 * de types du backend s'y typent, et le journal y confronte chaque fait au
 * moment de l'écrire (D2).
 *
 * 🔴 Une entrée à part du baril, et c'est voulu : ce fichier embarque zod et
 * tous les schémas, et le front de la plateforme, qui lit le baril au
 * démarrage, n'a aucune raison de les porter (voir `shop-values.ts`).
 */

/** Les familles, dans l'ordre des lots de phrases (lot D du plan). */
export const JOURNAL_FACT_FAMILIES = {
  referentialCatalogue: REFERENTIAL_CATALOGUE_FACTS,
  referentialSettings: REFERENTIAL_SETTINGS_FACTS,
  commerce: COMMERCE_FACTS,
  accountsAndCarts: ACCOUNTS_AND_CARTS_FACTS,
  ordersAndProduction: ORDERS_PRODUCTION_FACTS,
  pricing: PRICING_FACTS,
  accounting: ACCOUNTING_FACTS,
  team: TEAM_FACTS,
} as const satisfies Readonly<Record<string, JournalFactFamily>>;

export const JOURNAL_FACTS = {
  ...REFERENTIAL_CATALOGUE_FACTS,
  ...REFERENTIAL_SETTINGS_FACTS,
  ...COMMERCE_FACTS,
  ...ACCOUNTS_AND_CARTS_FACTS,
  ...ORDERS_PRODUCTION_FACTS,
  ...PRICING_FACTS,
  ...ACCOUNTING_FACTS,
  ...TEAM_FACTS,
} as const satisfies JournalFactFamily;

type Catalogue = typeof JOURNAL_FACTS;

/** Tout type que le journal contient — écrit aujourd'hui ou autrefois. */
export type JournalFactType = keyof Catalogue;

/** Les types qu'on écrit encore. */
export type ActiveJournalFactType = {
  [K in JournalFactType]: Catalogue[K]["retired"] extends true ? never : K;
}[JournalFactType];

/** Les types retirés : en base, plus jamais écrits. */
export type RetiredJournalFactType = Exclude<JournalFactType, ActiveJournalFactType>;

/** Tous les types, dans l'ordre du catalogue. */
export const JOURNAL_FACT_TYPES: readonly JournalFactType[] = keysOf(JOURNAL_FACTS);

/** Le type est-il au catalogue ? */
export function isJournalFactType(type: string): type is JournalFactType {
  return Object.hasOwn(JOURNAL_FACTS, type);
}

/** Pourquoi un fait ne passe pas : le type, ou la charge. */
export type JournalFactProblem =
  | { readonly kind: "unknown_type"; readonly message: string }
  | { readonly kind: "retired_type"; readonly message: string }
  | { readonly kind: "invalid_payload"; readonly message: string };

/**
 * Confronte un fait au catalogue : `null` s'il est conforme, sinon ce qui
 * cloche, en une phrase qui nomme le type et la clé fautive.
 *
 * Pure : c'est à l'appelant de décider s'il lève ou s'il signale (D2 — strict
 * en test, jamais bloquant en production).
 */
export function checkJournalFact(type: string, payload: unknown): JournalFactProblem | null {
  if (!isJournalFactType(type)) {
    return {
      kind: "unknown_type",
      message: `le type « ${type} » n'est pas au catalogue des faits (@lfd/contracts/journal-facts)`,
    };
  }
  const entry: JournalFactEntry = JOURNAL_FACTS[type];
  if (entry.retired) {
    return {
      kind: "retired_type",
      message: `le type « ${type} » est retiré du catalogue : il ne s'écrit plus`,
    };
  }
  const parsed = entry.payload.safeParse(payload);
  if (parsed.success) {
    return null;
  }
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(racine)"} : ${issue.message}`)
    .join(" ; ");
  return {
    kind: "invalid_payload",
    message: `la charge de « ${type} » ne suit pas son schéma — ${issues}`,
  };
}

function keysOf<T extends object>(record: T): (keyof T)[] {
  return Reflect.ownKeys(record).filter((key): key is keyof T & string => typeof key === "string");
}

export {
  JOURNAL_UNITS,
  type JournalFactEntry,
  type JournalFactFamily,
  type JournalUnit,
  type JournalValueMeta,
} from "./fact.js";
