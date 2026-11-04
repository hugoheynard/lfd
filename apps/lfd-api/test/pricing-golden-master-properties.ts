/**
 * **Les propriétés G3 du golden master** (plan `le-prix-d-un-panier.md`,
 * §3) : l'arithmétique de chaque sortie, et la concordance des conseils avec
 * la commande qu'ils annoncent — là où ils concordent AUJOURD'HUI.
 *
 * 🔴 Les écarts connus ne sont pas masqués : chacun est une exception NOMMÉE
 * (son numéro dans `inventaire-c0-assemblages.md`), DATÉE, bornée à une paire
 * de chemins et à des champs. Un écart hors de cette liste fait rougir ; une
 * exception que le corpus ne rencontre plus se lit dans `unusedGaps`.
 */
import type { Recorded, RecordedAmounts } from "./pricing-golden-master-record.js";

type Field = keyof Omit<RecordedAmounts, "vatMethod" | "lines"> | "lines";

/** Une paire « ce conseil annonce cette commande ». */
export interface Concordance {
  readonly advice: string;
  readonly order: string;
  readonly fields: readonly Field[];
}

const ALL: readonly Field[] = [
  "subtotalCents",
  "discountCents",
  "discounts",
  "voucherCents",
  "deliveryFeeCents",
  "lateFeeCents",
  "vat",
  "vatCents",
  "totalCents",
  "lines",
];

export const CONCORDANCES: readonly Concordance[] = [
  { advice: "A.shop-quote.anonymous", order: "C.shop-orders.guest", fields: ALL },
  { advice: "A.shop-quote.mine.personal", order: "C.orders.personal.card", fields: ALL },
  { advice: "A.shop-quote.mine.company", order: "C.orders.company.account", fields: ALL },
  { advice: "A.shop-quote.mine.company", order: "C.orders.company.card", fields: ALL },
  { advice: "A.shop-quote.mine.company", order: "C.admin-orders.account", fields: ALL },
  { advice: "A.shop-quote.mine.company", order: "C.admin-orders.link", fields: ALL },
  { advice: "A.shop-quote.mine.pending", order: "C.orders.pending.card", fields: ALL },
  { advice: "E.admin-orders-estimate.account", order: "C.admin-orders.account", fields: ALL },
  {
    advice: "B.orders-quote.company",
    order: "C.orders.company.account",
    fields: ["subtotalCents", "lines"],
  },
  {
    advice: "B.admin-orders-quote.company",
    order: "C.admin-orders.account",
    fields: ["subtotalCents", "lines"],
  },
  {
    advice: "B.orders-quote.personal",
    order: "C.orders.personal.card",
    fields: ["subtotalCents", "lines"],
  },
  { advice: "D.revision-quote.client", order: "D.revision.client", fields: ALL },
  { advice: "D.revision-quote.staff", order: "D.revision.staff", fields: ALL },
];

/** Un écart de l'inventaire, admis sur une paire et des champs. */
export interface KnownGap {
  readonly ecart: string;
  readonly since: string;
  readonly advice: string;
  readonly order: string;
  readonly fields: readonly Field[];
  /** Les cas du corpus où il joue ; absent = tout panier. */
  readonly baskets?: readonly string[];
  readonly why: string;
}

/**
 * Les écarts d'aujourd'hui, relevés par le corpus le 2026-11-03. Ils
 * disparaissent un par un aux lots L2-L3 : une ligne retirée ici est la
 * preuve qu'un écart a été tranché.
 */
// É11 retiré le 2026-11-03 (plan `le-prix-d-un-panier.md`, T1) : le devis d'une
// société chiffre la surtaxe prévue, et le cas `late-fee` prouve l'égalité.
export const KNOWN_GAPS: readonly KnownGap[] = [
  {
    ecart: "É16",
    since: "2026-11-03",
    advice: "B.orders-quote.personal",
    order: "C.orders.personal.card",
    fields: ["subtotalCents"],
    why: "en `exact_ht`, le sous-total du devis client « peut encore bouger d'un centime » à la passation",
  },
];

export interface Divergence {
  readonly basket: string;
  readonly advice: string;
  readonly order: string;
  readonly field: Field;
  readonly advised: unknown;
  readonly written: unknown;
}

function comparable(field: Field, amounts: RecordedAmounts): unknown {
  if (field !== "lines") return amounts[field];
  return amounts.lines.map((line) => ({
    sku: line.sku,
    quantity: line.quantity,
    unitPriceMillicents: line.unitPriceMillicents,
  }));
}

/** Les champs où un conseil et sa commande, tous deux servis, divergent. */
export function divergencesOf(
  basket: string,
  paths: Readonly<Record<string, Recorded>>,
): Divergence[] {
  const found: Divergence[] = [];
  for (const { advice, order, fields } of CONCORDANCES) {
    const advised = paths[advice]?.amounts;
    const written = paths[order]?.amounts;
    if (advised === null || advised === undefined || written === null || written === undefined)
      continue;
    for (const field of fields) {
      const a = comparable(field, advised);
      const w = comparable(field, written);
      if (a === null || w === null) continue;
      if (JSON.stringify(a) !== JSON.stringify(w)) {
        found.push({ basket, advice, order, field, advised: a, written: w });
      }
    }
  }
  return found;
}

/** L'écart nommé qui couvre une divergence, s'il existe. */
export function gapCovering(divergence: Divergence): KnownGap | undefined {
  return KNOWN_GAPS.find(
    (gap) =>
      (gap.baskets === undefined || gap.baskets.includes(divergence.basket)) &&
      gap.advice === divergence.advice &&
      gap.order === divergence.order &&
      gap.fields.includes(divergence.field),
  );
}

/**
 * Ce qu'une sortie doit vérifier seule : TTC = HT + TVA, la TVA par taux
 * retombe sur la TVA, aucun montant négatif. Rend les manquements, lisibles.
 */
export function arithmeticFaults(label: string, recorded: Recorded): string[] {
  const amounts = recorded.amounts;
  if (amounts === null) return [];
  const faults: string[] = [];
  const numbers = [
    amounts.subtotalCents,
    amounts.discountCents,
    amounts.voucherCents,
    amounts.deliveryFeeCents,
    amounts.lateFeeCents,
    amounts.vatCents,
    amounts.totalCents,
    ...(amounts.discounts ?? []),
    ...(amounts.vat ?? []).map((share) => share.amountCents),
    ...amounts.lines.flatMap((line) => [
      line.unitPriceMillicents,
      line.lineTotalCents,
      line.lineTotalTtcCents,
    ]),
  ];
  if (numbers.some((value) => value !== null && (value < 0 || !Number.isInteger(value)))) {
    faults.push(`${label} : montant négatif ou non entier`);
  }
  if (amounts.vat !== null && amounts.vatCents !== null) {
    const shares = amounts.vat.reduce((sum, share) => sum + share.amountCents, 0);
    if (shares !== amounts.vatCents)
      faults.push(`${label} : TVA par taux ${shares} ≠ TVA ${amounts.vatCents}`);
  }
  if (amounts.totalCents !== null && amounts.vatCents !== null) {
    const rebuilt =
      amounts.subtotalCents -
      (amounts.discountCents ?? 0) -
      (amounts.voucherCents ?? 0) +
      (amounts.deliveryFeeCents ?? 0) +
      (amounts.lateFeeCents ?? 0) +
      amounts.vatCents;
    if (rebuilt !== amounts.totalCents)
      faults.push(`${label} : HT + TVA = ${rebuilt} ≠ TTC ${amounts.totalCents}`);
  }
  const lineHt = amounts.lines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);
  if (
    amounts.lines.every((line) => line.lineTotalCents !== null) &&
    lineHt !== amounts.subtotalCents
  ) {
    faults.push(`${label} : lignes HT ${lineHt} ≠ sous-total ${amounts.subtotalCents}`);
  }
  return faults;
}
