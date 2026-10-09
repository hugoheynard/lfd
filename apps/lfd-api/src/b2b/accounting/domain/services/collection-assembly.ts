import type { CollectableOrder } from "../ports/collection-candidates.reader.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { judgeMandate, type Verdict } from "./collection-verdict.js";
import { debitsByScheme, nameOf } from "./collection-debit-drafts.js";
import { isBillable } from "./invoice-billability.js";
import type { Invoice } from "./invoice-dossier.types.js";
import type { CollectionExclusionReason } from "../entities/order-collection.js";

/**
 * **Qui paie quoi, sous quel mandat, chez quelle entité** — la partie pure de
 * la constitution d'un lot (plan `lot-de-prelevement-fige.md`).
 *
 * Pour chaque commande, dans cet ordre :
 *
 * 1. **le payeur** se résout par `billedPayerOf` — le principal que le site
 *    suivait en `billing` à la date de la commande, sinon la société ;
 * 2. si ce payeur n'est plus suivi **aujourd'hui** → `payer_detached` : le
 *    principal n'est jamais débité d'office pour un sous-compte qui ne le suit
 *    plus (Hugo, 2026-10-05, plan-sous-comptes §2.1 quater) ;
 * 3. **le mandat effectif** (plan-sous-comptes §2.1 ter) : pour un site réglé
 *    par son principal dont la forme, à la clôture, est « mandat du site »
 *    (sur le RIB du principal ou le sien), le mandat actif du SITE qui nomme
 *    ce principal débiteur ; à défaut, ou dans la forme « mandat du
 *    principal », le mandat actif du payeur. Aucun → `no_mandate` ; deux
 *    créanciers → `ambiguous_creditor` (une interdiction, pas un tirage).
 *    Les lignes se groupent PAR MANDAT : une par site dans les formes 2 et 3 ;
 * 4. un mandat d'une AUTRE entité laisse la commande intacte : elle appartient
 *    au lot de cette entité-là ;
 * 5. un mandat ponctuel déjà prélevé → `one_off_consumed` ;
 * 6. un schéma dont le lot de cette clôture vit déjà laisse la commande
 *    intacte : elle attend le lot suivant (la course avec la passation, §3) ;
 * 7. un bon qu'on ne sait pas facturer → `unbillable` : écarté, nommé, il ne
 *    bloque pas les autres (plan `le-prelevement-suit-la-facture.md`).
 *    Jugé en dernier : un bon d'une autre entité n'est pas le nôtre à écarter.
 *
 * Les étapes 1 à 6 vivent dans `collection-verdict.ts` (`judgeMandate`).
 *
 * ## Deux sortes de lignes depuis E4
 *
 * - **Une ligne qui encaisse des FACTURES ÉMISES** (plan
 *   `facture-emise.md`) : un bon couvert par une facture
 *   se juge AVEC elle — la facture entière, ou rien. Ses bons tous au même
 *   mandat → elle entre ; un bon ailleurs → elle attend ; un bon écarté →
 *   tous ses bons le sont, pour la même raison ; plusieurs mandats →
 *   `invoice_split` (depuis E4b, seulement si les mandats ont changé après
 *   l'émission : la facture du mois se fait par mandat). Montant = Σ TTC des factures, rien n'est recalculé.
 * - **Une ligne d'ARRÊTÉ**, l'ancien chemin, pour les seuls bons passés
 *   avant la mise en service de la facture du mois (`invoicingFloor`) : ils
 *   n'auront jamais de facture du mois. Montant = **total TTC de la facture
 *   calculée** en une fois sur ses bons (`simulateInvoiceDossier`), pas leur
 *   somme ; l'arrêté la fige.
 *
 * Un bon passé APRÈS la mise en service et sans facture n'entre pas : il
 * attend la sienne (la facture du mois l'a signalé, ou ne l'a pas encore
 * vu). Il n'est ni arrêté — il serait alors facturé deux fois —, ni écarté.
 * Sans plancher (`null`), seuls les bons facturés prennent le nouveau
 * chemin : l'absence du plancher ne peut jamais faire arrêter un bon facturé.
 *
 * La somme des bons est gardée à côté (`ordersTotalCents`) ; l'écart
 * appartient à la ligne, jamais à un bon.
 *
 * ⚠️ Un mandat actif SANS créancier (`creditor_id` nul, RUM reprise) ne
 * rattache à aucune entité : il compte comme absent. Choix conservateur — il
 * rend le lot indéposable et nomme la société — écrit au rapport du lot P1
 * plutôt que tranché en silence.
 */

export interface AssemblyInput {
  readonly legalEntityId: string;
  /** L'instant de la constitution — celui auquel on juge le détachement. */
  readonly at: Date;
  /** Début du cycle : une commande d'avant est « reprise » (`RmtInf`). */
  readonly cycleStartsAt: Date;
  readonly orders: readonly CollectableOrder[];
  readonly follows: readonly BillingFollow[];
  readonly mandates: readonly CollectionMandate[];
  /** La forme de prélèvement des sites à la clôture ; absent = `principal_mandate`. */
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  readonly consumedMandates: ReadonlySet<string>;
  readonly companyNames: ReadonlyMap<string, string>;
  readonly liveSchemes: readonly SepaScheme[];
  /** Les factures émises (380) qui couvrent ces bons, par bon (E4). */
  readonly invoices: ReadonlyMap<string, CollectableInvoice>;
  /**
   * La mise en service de la facture du mois : un bon passé depuis, sans
   * facture, attend la sienne. `null` = tous les bons sans facture suivent
   * l'ancien chemin (l'aperçu, qui simule ; une base sans plancher).
   */
  readonly invoicingFloor: Date | null;
}

/** Une facture émise que le lot peut encaisser — sa pièce est figée ailleurs. */
export interface CollectableInvoice {
  readonly invoiceId: string;
  readonly number: string;
  /** Son total TTC — ce que la ligne prélève pour elle. */
  readonly totalCents: number;
  /** TOUS ses bons : elle ne se prélève qu'entière. */
  readonly orderIds: readonly string[];
}

/**
 * Ce que la ligne encaisse : l'arrêté d'une facture calculée (bons d'avant la
 * facture du mois), ou des factures émises (E4).
 */
export type DebitSettlement =
  | {
      readonly kind: "statement";
      /** Calculée une fois ; l'arrêté (F3) la fige telle quelle. */
      readonly invoice: Invoice;
    }
  | { readonly kind: "invoices"; readonly invoices: readonly CollectableInvoice[] };

/** Une ligne à venir : un payeur, son mandat, ses commandes. */
export interface DebitDraft {
  readonly payerId: string;
  readonly debtorName: string;
  readonly mandate: CollectionMandate;
  readonly orders: readonly CollectableOrder[];
  readonly settles: DebitSettlement;
  /** Ce que la ligne prélève : le TTC de l'arrêté, ou Σ TTC des factures. */
  readonly amountCents: number;
  /** Σ des totaux des bons — l'écart est `amountCents − ordersTotalCents`. */
  readonly ordersTotalCents: number;
  readonly priorOrderCount: number;
}

export interface Exclusion {
  readonly order: CollectableOrder;
  readonly reason: CollectionExclusionReason;
}

export interface Assembly {
  /** Par schéma, dans l'ordre des rangs (RCUR d'abord, puis par nom). */
  readonly debits: ReadonlyMap<SepaScheme, readonly DebitDraft[]>;
  readonly exclusions: readonly Exclusion[];
  /** Les payeurs sans mandat, par leur nom — ils rendent le lot indéposable (Q2). */
  readonly unmandatedCompanies: readonly string[];
}

/** Un mandat, ses bons, et ses factures (`null` : une ligne d'arrêté). */
export interface DebitGroup {
  readonly payerId: string;
  readonly mandate: CollectionMandate;
  readonly orders: CollectableOrder[];
  /** `null` : une ligne d'arrêté. */
  readonly invoices: CollectableInvoice[] | null;
}

/** Ce que l'assemblage accumule. */
interface Accumulator {
  readonly exclusions: Exclusion[];
  readonly unmandated: Set<string>;
  readonly groups: Map<string, DebitGroup>;
}

export function assembleCollection(input: AssemblyInput): Assembly {
  const acc: Accumulator = { exclusions: [], unmandated: new Set(), groups: new Map() };
  const invoiced = new Map<string, { invoice: CollectableInvoice; orders: CollectableOrder[] }>();
  for (const order of input.orders) {
    const invoice = input.invoices.get(order.orderId);
    if (invoice !== undefined) {
      const entry = invoiced.get(invoice.invoiceId) ?? { invoice, orders: [] };
      entry.orders.push(order);
      invoiced.set(invoice.invoiceId, entry);
    } else if (input.invoicingFloor === null || order.placedAt < input.invoicingFloor) {
      collectStatementOrder(order, input, acc);
    }
  }
  for (const { invoice, orders } of invoiced.values()) {
    collectInvoice(invoice, orders, input, acc);
  }
  return {
    debits: debitsByScheme([...acc.groups.values()], input),
    exclusions: acc.exclusions,
    unmandatedCompanies: [...acc.unmandated].sort((left, right) => left.localeCompare(right, "fr")),
  };
}

/** L'ancien chemin : un bon jugé seul, facturable ou écarté. */
function collectStatementOrder(order: CollectableOrder, input: AssemblyInput, acc: Accumulator) {
  const verdict = judgeMandate(order, input);
  if (verdict.kind === "debit" && !isBillable(order.frozen)) {
    acc.exclusions.push({ order, reason: "unbillable" });
    return;
  }
  if (verdict.kind === "exclude") {
    exclude([order], verdict, input, acc);
    return;
  }
  if (verdict.kind === "debit") {
    groupOf(acc, `${verdict.mandate.mandateId}#statement`, verdict, null).orders.push(order);
  }
}

/**
 * Une facture se juge entière : ses bons ouverts doivent être TOUS là (un bon
 * déjà réglé autrement la laisse en attente — elle ne se prélève pas en
 * morceaux), puis tous au même mandat.
 */
function collectInvoice(
  invoice: CollectableInvoice,
  orders: readonly CollectableOrder[],
  input: AssemblyInput,
  acc: Accumulator,
): void {
  if (orders.length !== invoice.orderIds.length) {
    return;
  }
  const verdicts = orders.map((order) => judgeMandate(order, input));
  if (verdicts.some((verdict) => verdict.kind === "elsewhere")) {
    return;
  }
  const excluded = verdicts.find((verdict) => verdict.kind === "exclude");
  if (excluded !== undefined) {
    exclude(orders, excluded, input, acc);
    return;
  }
  const debits = verdicts.flatMap((verdict) => (verdict.kind === "debit" ? [verdict] : []));
  const [first] = debits;
  if (first === undefined) {
    return;
  }
  // Depuis E4b (2026-10-08), la facture du mois se fait PAR MANDAT effectif :
  // elle n'émet plus de facture à cheval, et ce motif n'est plus le cas
  // normal. Il reste le seul filet quand les mandats ont CHANGÉ entre
  // l'émission et le lot (mandat révoqué, forme de prélèvement du site
  // changée) — à trancher, rapport du lot E4b. La valeur reste en base.
  if (new Set(debits.map((debit) => debit.mandate.mandateId)).size > 1) {
    acc.exclusions.push(...orders.map((order) => ({ order, reason: "invoice_split" as const })));
    return;
  }
  const group = groupOf(acc, `${first.mandate.mandateId}#invoices`, first, []);
  group.orders.push(...orders);
  group.invoices?.push(invoice);
}

function exclude(
  orders: readonly CollectableOrder[],
  verdict: Extract<Verdict, { kind: "exclude" }>,
  input: AssemblyInput,
  acc: Accumulator,
): void {
  acc.exclusions.push(...orders.map((order) => ({ order, reason: verdict.reason })));
  if (verdict.reason === "no_mandate") {
    acc.unmandated.add(nameOf(verdict.payerId, input.companyNames));
  }
}

function groupOf(
  acc: Accumulator,
  key: string,
  verdict: Extract<Verdict, { kind: "debit" }>,
  invoices: CollectableInvoice[] | null,
): DebitGroup {
  const existing = acc.groups.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const group: DebitGroup = {
    payerId: verdict.payerId,
    mandate: verdict.mandate,
    orders: [],
    invoices,
  };
  acc.groups.set(key, group);
  return group;
}
