import { weekdayOf, weekdaySchema, type UsualSuggestionReason, type Weekday } from "@lfd/contracts";

/**
 * **« Vos habituels »** (lot R1 de
 * `documentation/recommandation-produit/plan-recommandation-de-produits.md`) —
 * le calcul pur, sans horloge ni base.
 *
 * L'historique est celui d'UNE société, lu sous son mur
 * (`PurchaseHistoryReader`) : un article, et le jour de chacune des commandes
 * qui le portent. Rien d'autre n'entre ici, et rien n'en sort qu'un SKU et sa
 * raison.
 */

/** La fenêtre glissante, en mois : celle des habitudes du back-office (`CUSTOMER_SKUS_WINDOW_MONTHS`). */
export const USUALS_WINDOW_MONTHS = 12;

const MONTHS_PER_YEAR = 12;

/**
 * **Le seuil d'une habitude** : moins de trois commandes, ce n'est pas une
 * habitude — une commande unique ne doit pas revenir à l'accueil comme si
 * elle en était une. Même valeur que `minPreviousOrders` de
 * `alerts/domain/detectors/first-order.ts` (relu le 2026-10-18), tenue à part.
 */
export const USUALS_MIN_ORDERS = 3;

/**
 * **Le minimum d'un rythme** : « Tous les mardis » sur deux mardis est un
 * mensonge (plan §6). En dessous, l'article reste un habituel, dit
 * « fréquent ».
 */
export const WEEKLY_RHYTHM_MIN_OCCURRENCES = 3;

/**
 * Les commandes qui disent une habitude — le périmètre des commandes PRISES,
 * celui de « souvent pris avec » (`bought-with.ts`) : ni brouillon, ni
 * annulée, ni carte non encaissée. Les commandes saisies par le staff
 * comptent (une commande prise au téléphone est la sienne) ; celles nées d'un
 * ABONNEMENT non : leur rythme est celui du planificateur, et proposer d'en
 * rajouter à l'accueil doublerait ce qui arrive déjà tout seul.
 */
export const USUALS_EXCLUDED_ORDER_STATUSES = ["draft", "cancelled"] as const;

/** Les règlements d'une commande prise : au compte, gratuit, ou encaissé. */
export const USUALS_COUNTED_PAYMENT_STATUSES = ["not_required", "paid"] as const;

/** Combien d'habituels l'accueil montre au plus. Jamais de remplissage en dessous. */
export const USUALS_PLACES = 8;

/** Ce que l'historique dit d'un article : le jour métier `AAAA-MM-JJ` de chaque commande qui le porte. */
export interface PurchasedSku {
  readonly sku: string;
  /** Un jour par commande distincte — deux commandes du même jour donnent deux entrées. */
  readonly days: readonly string[];
}

/** Un habituel, classé, avec sa raison. */
export interface UsualCandidate {
  readonly sku: string;
  readonly reason: UsualSuggestionReason;
}

/**
 * Le premier jour de la fenêtre, compris : le même quantième
 * {@link USUALS_WINDOW_MONTHS} mois plus tôt, ramené au dernier jour du mois
 * s'il n'y existe pas (un 31 retombe au 30, un 29 février au 28).
 */
export function usualsWindowStart(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const months = (year ?? 0) * MONTHS_PER_YEAR + (month ?? 1) - 1 - USUALS_WINDOW_MONTHS;
  const startYear = Math.floor(months / MONTHS_PER_YEAR);
  const startMonth = (months % MONTHS_PER_YEAR) + 1;
  const startDay = Math.min(day ?? 1, daysInMonth(startYear, startMonth));
  return [String(startYear).padStart(4, "0"), pad(startMonth), pad(startDay)].join("-");
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 31;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * **Les habituels, classés** : au moins {@link USUALS_MIN_ORDERS} commandes,
 * le plus repris d'abord, puis le plus récent, puis le SKU — l'habitude, pas
 * le prix. Un article déjà au panier n'est pas rendu.
 */
export function rankUsuals(
  history: readonly PurchasedSku[],
  inCart: readonly string[],
): readonly UsualCandidate[] {
  const excluded = new Set(inCart);
  return history
    .filter((entry) => entry.days.length >= USUALS_MIN_ORDERS && !excluded.has(entry.sku))
    .map((entry) => ({ entry, last: latest(entry.days) }))
    .sort((a, b) => before(a.entry, a.last, b.entry, b.last))
    .map(({ entry }) => ({ sku: entry.sku, reason: reasonOf(entry.days) }));
}

/**
 * **La raison d'un habituel** : le jour de la semaine qui revient, s'il revient
 * au moins {@link WEEKLY_RHYTHM_MIN_OCCURRENCES} fois ET plus souvent qu'aucun
 * autre ; sinon le nombre de commandes. Deux jours à égalité ne font pas un
 * rythme : « tous les mardis » serait aussi faux que « tous les jeudis ».
 */
export function reasonOf(days: readonly string[]): UsualSuggestionReason {
  const counts = new Map<Weekday, number>();
  for (const day of days) {
    const weekday = weekdayKey(day);
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (
    first !== undefined &&
    first[1] >= WEEKLY_RHYTHM_MIN_OCCURRENCES &&
    (second === undefined || second[1] < first[1])
  ) {
    return { source: "data", kind: "weekly_rhythm", weekday: first[0] };
  }
  return { source: "data", kind: "frequent", orderCount: days.length };
}

/** La clé de jour (`mon` … `sun`) d'un jour local ; `weekdayOf` compte depuis dimanche. */
function weekdayKey(day: string): Weekday {
  const mondayFirst = (weekdayOf(day) + 6) % 7;
  return weekdaySchema.options[mondayFirst] ?? "mon";
}

function latest(days: readonly string[]): string {
  return days.reduce((max, day) => (day > max ? day : max), "");
}

function before(a: PurchasedSku, aLast: string, b: PurchasedSku, bLast: string): number {
  if (a.days.length !== b.days.length) {
    return b.days.length - a.days.length;
  }
  if (aLast !== bLast) {
    return aLast > bLast ? -1 : 1;
  }
  return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
}
