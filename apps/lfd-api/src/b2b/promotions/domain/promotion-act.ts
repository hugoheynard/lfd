import { AUDIENCE_LABEL, type PromotionAudience } from "./promotion-audience.js";
import type { PromotionEffect } from "./promotion-effect.js";
import type { PromotionFulfillment } from "./promotion-fulfillment.js";
import type { Promotion } from "./promotion.js";
import type { PromotionTerms } from "./promotion-terms.js";

/**
 * **Un acte sur une promotion** — l'unité du journal (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9). Il s'écrit dans `pricing_events`, sujet `promotion`, à côté des
 * actes des règles qu'il remplacera, et en miroir au journal général
 * (`promotion.*`). Les clés écrites sont figées dès le premier fait.
 *
 * `replaced` = une révision des termes : le sujet garde son identité, la
 * phrase figée dit ce que la promotion dit désormais.
 */
export const PROMOTION_ACTS = ["posed", "paused", "resumed", "archived", "replaced"] as const;
export type PromotionActKind = (typeof PROMOTION_ACTS)[number];

/** Le sujet, dans `pricing_events.subject_type` comme au journal général. */
export const PROMOTION_SUBJECT = "promotion";

export interface PromotionAct {
  readonly subjectId: string;
  readonly kind: PromotionActKind;
  /** L'id de la fiche du membre du staff, ou un acteur système nommé. */
  readonly actor: string;
  readonly at: Date;
  /** Ce que l'auteur a écrit, quand l'écran le lui a demandé. */
  readonly reason: string | null;
  /** Ce que la promotion disait, figé à l'acte : recalculé, il mentirait. */
  readonly summary: string;
  /** Le nom interne au moment de l'acte. */
  readonly subjectLabel: string;
}

/** L'acte d'un geste sur cette promotion, avec sa phrase figée. */
export function promotionActOf(
  promotion: Promotion,
  kind: PromotionActKind,
  actor: string,
  at: Date,
  reason: string | null,
): PromotionAct {
  const terms = promotion.terms;
  return {
    subjectId: promotion.id,
    kind,
    actor,
    at,
    reason,
    summary: describePromotion(terms),
    subjectLabel: terms.internalName,
  };
}

/**
 * **La phrase que le staff lit** : « −20 % · particuliers inscrits · retrait
 * au point pk_1 · du 1er novembre 2026, sans date de fin ».
 *
 * Les sociétés et les points sont nommés par leur identifiant : le domaine ne
 * connaît pas leurs noms, et le résumé est figé à l'écriture.
 */
export function describePromotion(terms: PromotionTerms): string {
  return [
    describeEffect(terms.effect),
    // Plusieurs publics (L8b) se lisent « particuliers inscrits + pros ».
    terms.audiences.targets.map(describeAudience).join(" + "),
    describeFulfillment(terms.fulfillment),
    describeWindow(terms.validFrom, terms.validTo),
    // Dit seulement quand coché (§ 16) : les phrases déjà figées n'en parlent pas.
    ...(terms.cumulative ? ["cumulable"] : []),
  ].join(" · ");
}

function describeEffect(effect: PromotionEffect): string {
  switch (effect.kind) {
    case "percent_off":
      return `−${decimal(effect.basisPoints / BP_PER_PERCENT)} %`;
    case "unit_amount_off":
      return `−${euros(effect.millicents / MILLICENTS_PER_EURO)} à l'unité`;
    case "fixed_unit_price":
      return `prix posé ${euros(effect.millicents / MILLICENTS_PER_EURO)}`;
    case "basket_amount_off":
      return `−${euros(effect.cents / CENTS_PER_EURO)} sur le panier`;
  }
}

function describeAudience(audience: PromotionAudience): string {
  const label = AUDIENCE_LABEL[audience.kind];
  return audience.kind === "company" || audience.kind === "company_and_sites"
    ? `${label} (${audience.companyId})`
    : label;
}

function describeFulfillment(fulfillment: PromotionFulfillment): string {
  switch (fulfillment.kind) {
    case "any":
      return "tous acheminements";
    case "pickup":
      return "retrait";
    case "pickup_point":
      return `retrait au point ${fulfillment.pickupId}`;
    case "delivery":
      return "livraison";
  }
}

function describeWindow(validFrom: Date, validTo: Date | null): string {
  const from = `du ${day(validFrom)}`;
  return validTo === null ? `${from}, sans date de fin` : `${from} au ${day(validTo)}`;
}

const BP_PER_PERCENT = 100;
const MILLICENTS_PER_EURO = 100_000;
const CENTS_PER_EURO = 100;

function decimal(value: number): string {
  return String(value).replace(".", ",");
}

function euros(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Le jour civil à Paris, en toutes lettres — l'écriture des phrases du journal tarifaire. */
export function day(date: Date): string {
  const parts = LONG_DAY.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const dayOfMonth = part("day");
  return `${dayOfMonth === "1" ? "1er" : dayOfMonth} ${part("month")} ${part("year")}`;
}
