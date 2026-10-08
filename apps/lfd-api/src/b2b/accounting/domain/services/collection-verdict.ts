import type { CollectionExclusionReason } from "../entities/order-collection.js";
import type { CollectionMandate } from "../ports/collection-mandates.reader.js";
import type { BillingFollow } from "../ports/statement-billing.reader.js";
import {
  collectsOnSiteMandate,
  DEFAULT_COLLECTION_FORM,
  type CollectionFormName,
} from "../value-objects/collection-form.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { billedPayerOf, billingFollowAt } from "./billed-payer.js";

/**
 * **Sous quel mandat un bon se prélève** — les étapes 1 à 6 de
 * `assembleCollection`, sorties pour que la facture du mois (E4) fige le
 * MÊME mandat que le lot prendra (BG-16), et que le lot juge une facture
 * bon par bon sans recopier la règle.
 *
 * Le jugement « facturable ? » (étape 7) n'est pas ici : il ne regarde que
 * les bons sans facture émise — une facture émise l'a déjà été.
 */

/** Ce qu'il faut savoir d'un bon pour le juger. */
export interface JudgedOrder {
  readonly companyId: string;
  readonly placedAt: Date;
  readonly billedCompanyId: string | null;
}

/** Le monde dans lequel on juge : les mêmes lectures que la constitution. */
export interface VerdictContext {
  readonly legalEntityId: string;
  /** L'instant auquel on juge le détachement. */
  readonly at: Date;
  readonly follows: readonly BillingFollow[];
  readonly mandates: readonly CollectionMandate[];
  /** La forme de prélèvement des sites ; absent = `principal_mandate`. */
  readonly collectionForms: ReadonlyMap<string, CollectionFormName>;
  readonly consumedMandates: ReadonlySet<string>;
  readonly liveSchemes: readonly SepaScheme[];
}

export type Verdict =
  | { readonly kind: "debit"; readonly payerId: string; readonly mandate: CollectionMandate }
  | {
      readonly kind: "exclude";
      readonly reason: CollectionExclusionReason;
      readonly payerId: string;
    }
  | { readonly kind: "elsewhere" };

/**
 * Le verdict d'un bon, sans le jugement « facturable » : payeur détaché,
 * mandat effectif, créancier, mandat ponctuel consommé, schéma déjà pris.
 */
export function judgeMandate(order: JudgedOrder, context: VerdictContext): Verdict {
  const payerId = billedPayerOf(order, context.follows);
  if (payerId !== order.companyId) {
    const now = billingFollowAt(order.companyId, context.at, context.follows);
    if (now?.payerId !== payerId) {
      return { kind: "exclude", reason: "payer_detached", payerId };
    }
  }
  const { candidates, answerable } = effectiveMandates(order, payerId, context);
  const creditors = new Set(candidates.map((mandate) => mandate.creditorId));
  const mandate = candidates[0];
  if (mandate === undefined) {
    // `payerId` porte ici qui NOMMER : le site quand il a choisi son mandat.
    return { kind: "exclude", reason: "no_mandate", payerId: answerable };
  }
  if (creditors.size > 1) {
    return { kind: "exclude", reason: "ambiguous_creditor", payerId };
  }
  if (mandate.creditorId !== context.legalEntityId) {
    return { kind: "elsewhere" };
  }
  if (mandate.paymentType === "one_off" && context.consumedMandates.has(mandate.mandateId)) {
    return { kind: "exclude", reason: "one_off_consumed", payerId };
  }
  if (context.liveSchemes.includes(mandate.scheme)) {
    return { kind: "elsewhere" };
  }
  return { kind: "debit", payerId, mandate };
}

/**
 * Le mandat EFFECTIF d'un bon chez cette entité — `null` s'il n'y en a pas
 * exactement un. Ce que la facture du mois fige (BG-16) : ni le schéma déjà
 * pris, ni le mandat ponctuel consommé, ni le détachement n'y entrent — ils
 * décident du LOT, pas du moyen de paiement que la facture annonce.
 */
export function effectiveMandateOf(
  order: JudgedOrder,
  context: Pick<VerdictContext, "legalEntityId" | "follows" | "mandates" | "collectionForms">,
): CollectionMandate | null {
  const payerId = billedPayerOf(order, context.follows);
  const { candidates } = effectiveMandates(order, payerId, context);
  const [mandate, ...others] = candidates;
  if (mandate === undefined || others.length > 0) {
    return null;
  }
  return mandate.creditorId === context.legalEntityId ? mandate : null;
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
  order: JudgedOrder,
  payerId: string,
  context: Pick<VerdictContext, "mandates" | "collectionForms">,
): { readonly candidates: readonly CollectionMandate[]; readonly answerable: string } {
  const usable = context.mandates.filter((mandate) => mandate.creditorId !== null);
  const form = context.collectionForms.get(order.companyId) ?? DEFAULT_COLLECTION_FORM;
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
