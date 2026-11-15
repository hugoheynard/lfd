import {
  hasLegalIdentity,
  hasRequiredVat,
  isReachable,
} from "../../account/domain/services/activation-gate.js";
import type { WorkLevelInput } from "../../account/domain/services/work-level.js";
import { requiresVatNumber } from "../../account/domain/value-objects/vat-liability.js";
import type { BillingMode } from "../../accounting/domain/value-objects/billing-mode.js";
import type { CollectionMeans } from "../../accounting/domain/value-objects/collection-means.js";

/**
 * **La grille d'étapes** du suivi commercial
 * (`documentation/b2b/plan-suivi-commercial.md`, § 1 bis) : ce que la fiche
 * contient, étape par étape, en données — l'écran en tire ses mots — et la
 * prochaine étape, une seule.
 *
 * Les pièces de « Fiche remplie » sont celles de la porte d'activation
 * (`activation-gate.ts`), par ses propres fonctions : la grille ne peut pas
 * dire « remplie » d'une fiche que l'activation refuserait pour la même pièce.
 */

/** Au-delà de ce nombre de jours sans contact, une fiche pas encore active est à recontacter. */
export const STALE_CONTACT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type NextStepActor = "commercial" | "client" | "accounting" | "none";

/** Le dernier contact : son jour de Paris, et depuis combien de jours. */
export interface ContactStep {
  readonly last: string | null;
  readonly daysAgo: number | null;
}

export type LegalPiece = "legal_identity" | "vat" | "phone" | "billing_address";
export const LEGAL_PIECES_COUNT = 4;
export type KbisStep = "certified" | "to_verify" | "missing";
export type PaymentTermsStep = "on_order" | "on_account";
export type DebitReadiness =
  "ready" | "bank_account_missing" | "mandate_missing" | "blocked" | "not_applicable";
export type DeliveryStep = "address" | "pickup" | "missing";
export type NextStep =
  | "assign"
  | "contact"
  | "complete_sheet"
  | "bank_account"
  | "mandate"
  | "login"
  | "activate"
  | "none";

/** Ce que la base dit d'une fiche, au-delà du calcul de niveau. */
export interface SheetStepFacts {
  readonly legal: {
    readonly raisonSociale: string;
    readonly formeJuridique: string;
    readonly siret: string;
    readonly vatNumber: string;
    /** Le téléphone de l'interlocuteur principal. */
    readonly primaryPhone: string;
    /** Les téléphones des autres interlocuteurs du carnet (vides compris ou non). */
    readonly otherPhones: readonly string[];
  };
  readonly kbis: { readonly uploadedAt: Date | null; readonly certifiedAt: Date | null };
  /** Les crédits accordés, et celui demandé (`null` : aucun). */
  readonly terms: { readonly granted: readonly string[]; readonly requested: string | null };
  /** Le rythme et le moyen du payeur, résolus à l'instant de la lecture. */
  readonly collection: { readonly rhythm: BillingMode; readonly means: CollectionMeans };
  readonly hasBankAccount: boolean;
  readonly hasActiveMandate: boolean;
  readonly directDebitBlocked: boolean;
  readonly orderCount: number;
  /** Le jour de Paris (`AAAA-MM-JJ`) du DERNIER contact noté ou rendez-vous honoré. */
  readonly lastContactDay: string | null;
}

export interface LegalStep {
  readonly done: number;
  readonly of: typeof LEGAL_PIECES_COUNT;
  readonly missing: readonly LegalPiece[];
  readonly nameOnly: boolean;
}

export interface PaymentStep {
  readonly terms: PaymentTermsStep;
  readonly requested: boolean;
  readonly rhythm: BillingMode | null;
  readonly means: CollectionMeans | null;
}

/** La grille d'une fiche. */
export interface SheetSteps {
  readonly contact: ContactStep;
  readonly legal: LegalStep;
  readonly kbis: KbisStep;
  readonly payment: PaymentStep;
  readonly debitReady: DebitReadiness;
  readonly delivery: DeliveryStep;
  readonly login: boolean;
  readonly activated: boolean;
  readonly orders: number;
}

/** Lit la grille d'une fiche, `today` étant le jour de Paris de la lecture. Pur. */
export function sheetStepsOf(
  work: WorkLevelInput,
  facts: SheetStepFacts,
  today: string,
): SheetSteps {
  const payment = paymentOf(facts);
  return {
    contact: contactOf(facts.lastContactDay, today),
    legal: legalOf(work, facts),
    kbis: kbisOf(facts.kbis),
    payment,
    debitReady: debitReadinessOf(payment, facts),
    delivery: deliveryOf(work),
    login: work.holderLoggedIn,
    activated: work.activated,
    orders: facts.orderCount,
  };
}

function contactOf(last: string | null, today: string): ContactStep {
  if (last === null) {
    return { last: null, daysAgo: null };
  }
  const days = Math.round((Date.parse(today) - Date.parse(last)) / DAY_MS);
  return { last, daysAgo: Math.max(0, days) };
}

/** Un contact est-il à (re)faire ? Jamais fait, ou trop vieux sur une fiche pas encore active. */
export function needsContact(steps: Pick<SheetSteps, "contact" | "activated">): boolean {
  const { daysAgo } = steps.contact;
  return daysAgo === null || (!steps.activated && daysAgo > STALE_CONTACT_DAYS);
}

/** Le dernier contact est-il trop vieux sur une fiche pas encore active ? */
export function isContactStale(steps: Pick<SheetSteps, "contact" | "activated">): boolean {
  return steps.contact.daysAgo !== null && needsContact(steps);
}

function legalOf(work: WorkLevelInput, facts: SheetStepFacts): LegalStep {
  const { legal } = facts;
  const held: Readonly<Record<LegalPiece, boolean>> = {
    legal_identity: hasLegalIdentity(legal),
    vat: hasRequiredVat({
      vatNumberRequired: requiresVatNumber(legal.formeJuridique),
      vatNumber: legal.vatNumber,
    }),
    phone: isReachable({
      primaryContact: { phone: legal.primaryPhone },
      contacts: legal.otherPhones.map((phone) => ({ phone })),
    }),
    billing_address: work.hasBillingAddress,
  };
  const pieces: readonly LegalPiece[] = ["legal_identity", "vat", "phone", "billing_address"];
  const missing = pieces.filter((piece) => !held[piece]);
  const done = LEGAL_PIECES_COUNT - missing.length;
  return {
    done,
    of: LEGAL_PIECES_COUNT,
    missing,
    nameOnly: done === 0 && legal.siret.trim() === "",
  };
}

/** Certifié, sinon déposé (à vérifier), sinon rien. */
function kbisOf(kbis: SheetStepFacts["kbis"]): KbisStep {
  if (kbis.certifiedAt !== null) {
    return "certified";
  }
  return kbis.uploadedAt === null ? "missing" : "to_verify";
}

/** Au compte dès qu'un crédit est accordé ; le rythme et le moyen n'ont de sens qu'au compte. */
function paymentOf(facts: SheetStepFacts): PaymentStep {
  const { granted, requested } = facts.terms;
  const onAccount = granted.length > 0;
  return {
    terms: onAccount ? "on_account" : "on_order",
    requested: requested !== null && !granted.includes(requested),
    rhythm: onAccount ? facts.collection.rhythm : null,
    means: onAccount ? facts.collection.means : null,
  };
}

/**
 * Prêt à prélever : sans objet hors du prélèvement au compte ; sinon le
 * blocage de la comptabilité d'abord (il vaut quoi qu'on fournisse), puis le
 * RIB, puis le mandat signé.
 */
function debitReadinessOf(payment: PaymentStep, facts: SheetStepFacts): DebitReadiness {
  if (payment.terms === "on_order" || payment.means !== "sepa_debit") {
    return "not_applicable";
  }
  if (facts.directDebitBlocked) {
    return "blocked";
  }
  if (!facts.hasBankAccount) {
    return "bank_account_missing";
  }
  return facts.hasActiveMandate ? "ready" : "mandate_missing";
}

function deliveryOf(work: WorkLevelInput): DeliveryStep {
  if (work.deliveryAddressCount > 0) {
    return "address";
  }
  return work.noDeliveryAddressNeeded ? "pickup" : "missing";
}

/**
 * La prochaine étape, une seule, dans l'ordre du plan : attribuer, contacter,
 * compléter la fiche (les quatre pièces), RIB puis mandat (au prélèvement
 * seulement), connexion du client, activer. Un prélèvement bloqué par la
 * comptabilité n'est pas un geste du commercial : il ne retient pas la suite.
 */
export function nextStepOf(followed: boolean, steps: SheetSteps): NextStep {
  if (!followed) {
    return "assign";
  }
  if (needsContact(steps)) {
    return "contact";
  }
  if (steps.legal.missing.length > 0) {
    return "complete_sheet";
  }
  if (steps.debitReady === "bank_account_missing") {
    return "bank_account";
  }
  if (steps.debitReady === "mandate_missing") {
    return "mandate";
  }
  if (!steps.login) {
    return "login";
  }
  return steps.activated ? "none" : "activate";
}

/** Quelle étape revient à qui : le commercial demande le RIB, le client signe et se connecte. */
const STEP_ACTORS: Readonly<Record<NextStep, NextStepActor>> = {
  assign: "commercial",
  contact: "commercial",
  complete_sheet: "commercial",
  bank_account: "commercial",
  mandate: "client",
  login: "client",
  activate: "commercial",
  none: "none",
};

/**
 * Qui doit agir. Un prélèvement bloqué ne retient pas la prochaine étape ;
 * quand il n'en reste aucune, c'est à la comptabilité de lever le blocage.
 */
export function nextStepActorOf(nextStep: NextStep, steps: SheetSteps): NextStepActor {
  if (nextStep === "none" && steps.debitReady === "blocked") {
    return "accounting";
  }
  return STEP_ACTORS[nextStep];
}
