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

/**
 * **Les noms des points et des zones au moment du fait** (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 8.4) : le
 * journal nomme ce qu'il vise par son libellé, pas par son identifiant. Un
 * nom absent retombe sur l'identifiant (une zone supprimée depuis).
 */
export interface FulfillmentNames {
  readonly points: ReadonlyMap<string, string>;
  readonly zones: ReadonlyMap<string, string>;
}

export const NO_FULFILLMENT_NAMES: FulfillmentNames = { points: new Map(), zones: new Map() };

/** L'acte d'un geste sur cette promotion, avec sa phrase figée. */
export function promotionActOf(
  promotion: Promotion,
  kind: PromotionActKind,
  actor: string,
  at: Date,
  reason: string | null,
  names: FulfillmentNames = NO_FULFILLMENT_NAMES,
): PromotionAct {
  const terms = promotion.terms;
  return {
    subjectId: promotion.id,
    kind,
    actor,
    at,
    reason,
    summary: describePromotion(terms, names),
    subjectLabel: terms.internalName,
  };
}

/**
 * **La phrase que le staff lit** : « −20 % · particuliers inscrits · retrait
 * au point Cœur de station et livraison · du 1er novembre 2026, sans date de
 * fin ».
 *
 * Les sociétés sont nommées par leur identifiant ; les points et les zones
 * par le nom que l'appelant a lu au moment du fait (`names`), à défaut par
 * leur identifiant. Le résumé est figé à l'écriture.
 */
export function describePromotion(
  terms: PromotionTerms,
  names: FulfillmentNames = NO_FULFILLMENT_NAMES,
): string {
  return [
    describeEffect(terms.effect),
    // Plusieurs publics (L8b) se lisent « particuliers inscrits + pros ».
    terms.audiences.targets.map(describeAudience).join(" + "),
    describeFulfillment(terms.fulfillment, names),
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

function describeFulfillment(fulfillment: PromotionFulfillment, names: FulfillmentNames): string {
  if (fulfillment.kind === "displayed_price") {
    return "dans le prix affiché";
  }
  const parts: string[] = [];
  const { pickup, delivery } = fulfillment;
  if (pickup !== "none") {
    parts.push(
      pickup === "all"
        ? "retrait"
        : `retrait ${pickup.points.length === 1 ? "au point" : "aux points"} ${named(pickup.points, names.points)}`,
    );
  }
  if (delivery !== "none") {
    parts.push(
      delivery === "all"
        ? "livraison"
        : `livraison ${delivery.zones.length === 1 ? "en zone" : "dans les zones"} ${named(delivery.zones, names.zones)}`,
    );
  }
  return parts.join(" et ");
}

function named(ids: readonly string[], names: ReadonlyMap<string, string>): string {
  return ids.map((id) => names.get(id) ?? id).join(", ");
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
