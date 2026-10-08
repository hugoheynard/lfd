import type { CollectionExclusionReason } from "../entities/order-collection.js";
import type { CollectableOrder } from "../ports/collection-candidates.reader.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import {
  collectsOnSiteMandate,
  DEFAULT_COLLECTION_FORM,
  type CollectionFormName,
} from "../value-objects/collection-form.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { billedPayerOf, billingFollowAt } from "./billed-payer.js";
import { isBillable } from "./invoice-billability.js";
import { simulateInvoiceDossier } from "./invoice-dossier.js";
import type { Invoice } from "./invoice-dossier.types.js";
import { SEQUENCE_ORDER, sequenceTypeOf } from "./pain008-document.js";

/**
 * **Qui paie quoi, sous quel mandat, chez quelle entité** — la partie pure de
 * la constitution d'un lot (plan `plan-lot-de-prelevement-fige.md`, §1, §3, §5).
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
 *    bloque pas les autres (plan `plan-le-prelevement-suit-la-facture.md`, F2).
 *    Jugé en dernier : un bon d'une autre entité n'est pas le nôtre à écarter.
 *
 * Le montant d'une ligne est le **total TTC de la facture** calculée en une
 * fois sur exactement ses bons (`simulateInvoiceDossier`), pas leur somme ;
 * la somme est gardée à côté (`ordersTotalCents`), l'écart appartient à la
 * ligne, jamais à un bon.
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
}

/** Une ligne à venir : un payeur, son mandat, ses commandes. */
export interface DebitDraft {
  readonly payerId: string;
  readonly debtorName: string;
  readonly mandate: CollectionMandate;
  readonly orders: readonly CollectableOrder[];
  /**
   * La facture de ces bons, calculée en une fois — la SEULE fois : l'arrêté
   * de facturation (F3) la fige telle quelle, sans la recalculer.
   */
  readonly invoice: Invoice;
  /** Le total TTC de cette facture : `invoice.totalCents`. */
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

type Verdict =
  | { readonly kind: "debit"; readonly payerId: string; readonly mandate: CollectionMandate }
  | {
      readonly kind: "exclude";
      readonly reason: CollectionExclusionReason;
      readonly payerId: string;
    }
  | { readonly kind: "elsewhere" };

export function assembleCollection(input: AssemblyInput): Assembly {
  const exclusions: Exclusion[] = [];
  const unmandated = new Set<string>();
  const byMandate = new Map<
    string,
    { payerId: string; mandate: CollectionMandate; orders: CollectableOrder[] }
  >();

  for (const order of input.orders) {
    const verdict = judge(order, input);
    if (verdict.kind === "elsewhere") {
      continue;
    }
    if (verdict.kind === "exclude") {
      exclusions.push({ order, reason: verdict.reason });
      if (verdict.reason === "no_mandate") {
        unmandated.add(nameOf(verdict.payerId, input.companyNames));
      }
      continue;
    }
    const group = byMandate.get(verdict.mandate.mandateId) ?? {
      payerId: verdict.payerId,
      mandate: verdict.mandate,
      orders: [],
    };
    group.orders.push(order);
    byMandate.set(verdict.mandate.mandateId, group);
  }

  return {
    debits: groupByScheme([...byMandate.values()], input),
    exclusions,
    unmandatedCompanies: [...unmandated].sort((left, right) => left.localeCompare(right, "fr")),
  };
}

function judge(order: CollectableOrder, input: AssemblyInput): Verdict {
  const payerId = billedPayerOf(order, input.follows);
  if (payerId !== order.companyId) {
    const now = billingFollowAt(order.companyId, input.at, input.follows);
    if (now?.payerId !== payerId) {
      return { kind: "exclude", reason: "payer_detached", payerId };
    }
  }
  const { candidates, answerable } = effectiveMandates(order, payerId, input);
  const creditors = new Set(candidates.map((mandate) => mandate.creditorId));
  const mandate = candidates[0];
  if (mandate === undefined) {
    // `payerId` porte ici qui NOMMER : le site quand il a choisi son mandat.
    return { kind: "exclude", reason: "no_mandate", payerId: answerable };
  }
  if (creditors.size > 1) {
    return { kind: "exclude", reason: "ambiguous_creditor", payerId };
  }
  if (mandate.creditorId !== input.legalEntityId) {
    return { kind: "elsewhere" };
  }
  if (mandate.paymentType === "one_off" && input.consumedMandates.has(mandate.mandateId)) {
    return { kind: "exclude", reason: "one_off_consumed", payerId };
  }
  if (input.liveSchemes.includes(mandate.scheme)) {
    return { kind: "elsewhere" };
  }
  if (!isBillable(order.frozen)) {
    return { kind: "exclude", reason: "unbillable", payerId };
  }
  return { kind: "debit", payerId, mandate };
}

/**
 * Les mandats parmi lesquels la commande se prélève, et qui nommer s'il n'y en
 * a aucun. Forme 1 (ou payeur = société) : ceux du payeur. Formes 2 et 3 :
 * ceux du SITE qui nomment ce payeur, et eux seuls — le site a choisi son
 * mandat, débiter le principal en silence est le cas interdit (Hugo,
 * 2026-10-05) ; sans mandat de site, `no_mandate` nomme le site (Q2).
 * Un mandat sans créancier ne rattache à aucune entité : il compte comme absent.
 */
function effectiveMandates(
  order: CollectableOrder,
  payerId: string,
  input: AssemblyInput,
): { readonly candidates: readonly CollectionMandate[]; readonly answerable: string } {
  const usable = input.mandates.filter((mandate) => mandate.creditorId !== null);
  const form = input.collectionForms.get(order.companyId) ?? DEFAULT_COLLECTION_FORM;
  if (payerId !== order.companyId && collectsOnSiteMandate(form)) {
    return {
      candidates: usable.filter(
        (mandate) => mandate.companyId === order.companyId && mandate.debtorCompanyId === payerId,
      ),
      answerable: order.companyId,
    };
  }
  return {
    candidates: usable.filter(
      (mandate) => mandate.companyId === payerId && mandate.debtorCompanyId === payerId,
    ),
    answerable: payerId,
  };
}

function groupByScheme(
  groups: readonly { payerId: string; mandate: CollectionMandate; orders: CollectableOrder[] }[],
  input: AssemblyInput,
): ReadonlyMap<SepaScheme, readonly DebitDraft[]> {
  const drafts = groups.map((group): DebitDraft => {
    const dossier = simulateInvoiceDossier(group.orders.map((order) => order.frozen));
    return {
      payerId: group.payerId,
      debtorName: nameOf(group.payerId, input.companyNames),
      mandate: group.mandate,
      orders: [...group.orders].sort((left, right) =>
        left.orderNumber.localeCompare(right.orderNumber),
      ),
      invoice: dossier.invoice,
      amountCents: dossier.invoice.totalCents,
      ordersTotalCents: dossier.ordersTotalCents,
      priorOrderCount: group.orders.filter((order) => order.placedAt < input.cycleStartsAt).length,
    };
  });
  const result = new Map<SepaScheme, readonly DebitDraft[]>();
  for (const scheme of ["CORE", "B2B"] as const) {
    const ofScheme = drafts.filter((draft) => draft.mandate.scheme === scheme);
    if (ofScheme.length > 0) {
      result.set(scheme, inRankOrder(ofScheme));
    }
  }
  return result;
}

/** RCUR puis OOFF (l'ordre des blocs du fichier), puis par nom, puis par id. */
function inRankOrder(drafts: readonly DebitDraft[]): readonly DebitDraft[] {
  const byName = [...drafts].sort(
    (left, right) =>
      left.debtorName.localeCompare(right.debtorName, "fr") ||
      left.payerId.localeCompare(right.payerId),
  );
  return SEQUENCE_ORDER.flatMap((sequence) =>
    byName.filter((draft) => sequenceTypeOf(draft.mandate.paymentType) === sequence),
  );
}

/** Le nom du payeur ; son id si l'annuaire ne le connaît pas — jamais un nom inventé. */
function nameOf(companyId: string, names: ReadonlyMap<string, string>): string {
  return names.get(companyId) ?? companyId;
}
