import { companyServiceOf } from "../../catalog/domain/company-service.js";
import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import type { PromotionAudience, PromotionAudienceKind } from "./promotion-audience.js";
import type { LabelAudience } from "./promotion-audience-set.js";
import type { PromotionFulfillment } from "./promotion-fulfillment.js";

/**
 * **Le ciblage** — « cette commande est-elle concernée ? » (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 12 et § 13.3, lot L5).
 *
 * Pur. Les faits sont **établis au serveur**, jamais reçus : le statut de la
 * société relu en base, la porte d'entrée posée par la route (L1), le point
 * de retrait retenu par la caisse. Un fait que l'appelant ne connaît pas est
 * `unknown`, et un public qui le demande **ne s'applique pas** : une remise
 * accordée sur une supposition est une remise que personne n'a décidée.
 */

/** Sans compte, reconnu, ou inconnu (le tableau du staff, la projection). */
export type PromotionBuyerKind = "guest" | "registered" | "unknown";

/**
 * **La porte d'entrée telle que le tarif la transmet au point ligne** (lot
 * L10, § 13.7) : celle de la route, plus `previewed` — l'aperçu sans société
 * dont l'audience est DÉCLARÉE par la requête (`GET /shop/catalogue?audience=pro`).
 * Une audience déclarée n'est pas un fait établi : seul « tout le monde » y
 * joue (§ 7 S — le rayon), sans quoi taper `?audience=pro` publierait une
 * promotion réservée.
 */
export type PricedBuyerKind = PromotionBuyerKind | "previewed";

/**
 * Les faits de l'aperçu déclaré : aucun statut, aucune porte, aucune société —
 * seul `everyone` admet (`audienceAdmits` ne vise ni société ni statut inconnu).
 */
export const PREVIEWED_FACTS: PromotionAudienceFacts = {
  companyId: null,
  companyStatus: "unknown",
  principal: "unknown",
  buyerKind: "unknown",
  fulfillment: null,
};

/** Le principal que la société suit — `unknown` tant qu'aucune question ne l'a lu. */
export type PrincipalFact = "unknown" | { readonly companyId: string | null };

/**
 * L'acheminement retenu ; `null` = inconnu (rayon, fiche, devis sans service).
 *
 * En livraison, la ZONE entre dans le fait (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 8.1) : résolue
 * par le code postal, à la règle même des frais (préfixe le plus long), et
 * reçue déjà résolue — les promotions ne lisent pas les zones. `null` = aucune
 * zone ne couvre ce code postal (l'annonce, les témoins : inatteignable à la
 * caisse, qui refuse la livraison avant). Au retrait, `pickupId` `null` = le
 * point n'est pas encore choisi (le devis anonyme) : seul « tous les points »
 * l'admet, comme seul « toutes les zones » admet une livraison sans zone.
 */
export type FulfillmentFact =
  | { readonly method: "pickup"; readonly pickupId: string | null }
  | { readonly method: "delivery"; readonly zoneId: string | null };

export interface PromotionAudienceFacts {
  /** La société servie ; `null` = particulier. */
  readonly companyId: string | null;
  /**
   * Son statut relu en base ; `null` = aucune société (ou inconnue en base) ;
   * `unknown` = pas lu pour cette question.
   */
  readonly companyStatus: StandingCompanyStatus | null | "unknown";
  readonly principal: PrincipalFact;
  readonly buyerKind: PromotionBuyerKind;
  readonly fulfillment: FulfillmentFact | null;
}

/**
 * **Ce public vise-t-il ces faits ?**
 *
 * « Pro ou pas » est LA décision de P0 (`companyServiceOf`) : une société en
 * attente est servie en pro, une suspendue au public. `everyone_but_active_pros`
 * est l'autre règle, celle de `audienceOf` (pro pour une société ACTIVE
 * seulement) — la clientèle qui recevait la remise de retrait des
 * particuliers, reprise telle quelle (§ 13.2).
 */
export function audienceAdmits(
  audience: PromotionAudience,
  facts: PromotionAudienceFacts,
): boolean {
  switch (audience.kind) {
    case "everyone":
      return true;
    case "company":
      return facts.companyId === audience.companyId;
    case "company_and_sites":
      return facts.companyId === audience.companyId || principalIs(facts, audience.companyId);
    default:
      return byStatus(audience.kind, facts);
  }
}

type StatusAudience = Exclude<PromotionAudienceKind, "everyone" | "company" | "company_and_sites">;

function byStatus(kind: StatusAudience, facts: PromotionAudienceFacts): boolean {
  const status = facts.companyStatus;
  if (status === "unknown") {
    return false;
  }
  const pro = companyServiceOf(status) === "pro";
  switch (kind) {
    case "individuals":
      return !pro;
    case "individuals_guest":
      return !pro && facts.buyerKind === "guest";
    case "individuals_registered":
      return !pro && facts.buyerKind === "registered";
    case "pros":
      return pro;
    case "pros_active":
      return status === "active";
    case "pros_pending":
      return status === "pending";
    case "everyone_but_active_pros":
      return status !== "active";
  }
}

function principalIs(facts: PromotionAudienceFacts, companyId: string): boolean {
  return facts.principal !== "unknown" && facts.principal.companyId === companyId;
}

/**
 * **Le rang d'un public à plusieurs cibles, pour CET acheteur** (§ 15.6) : le
 * plus haut rang parmi les cibles qui l'admettent ; `null` = aucune ne
 * l'admet. Une cible seule garde le rang d'avant L8b.
 */
export function admittingRankOf(
  audiences: readonly PromotionAudience[],
  facts: PromotionAudienceFacts,
): number | null {
  const ranks = audiences
    .filter((audience) => audienceAdmits(audience, facts))
    .map((audience) => PUBLIC_RANK[audience.kind]);
  return ranks.length === 0 ? null : Math.max(...ranks);
}

/**
 * **L'audience de l'acheteur, au sens des libellés** (§ 15.8) — la décision
 * de P0, comme `byStatus` : pro ou particulier. Statut non lu ⇒ `null`, le
 * libellé commun.
 */
export function labelAudienceOf(facts: PromotionAudienceFacts): LabelAudience | null {
  if (facts.companyStatus === "unknown") {
    return null;
  }
  return companyServiceOf(facts.companyStatus) === "pro" ? "pros" : "individuals";
}

/** Les publics qui demandent le statut de la société — lu seulement s'il le faut. */
export function audienceNeedsStatus(audience: PromotionAudience): boolean {
  return (
    audience.kind !== "everyone" &&
    audience.kind !== "company" &&
    audience.kind !== "company_and_sites"
  );
}

/**
 * **Cet acheminement vise-t-il la commande ?** Inconnu (`null`), seul « dans
 * le prix affiché » s'applique : une promotion « en retrait » ne baisse pas
 * un prix dont on ne sait pas comment il sera servi (§ 13.2, RAYON).
 *
 * Retrait au point P : `pickup = all`, ou P nommé. Livraison dans la zone Z :
 * `delivery = all`, ou Z nommée ; une livraison sans zone n'est admise que par
 * `delivery = all` (plan des acheminements, § 3, § 8.1).
 */
export function fulfillmentAdmits(
  fulfillment: PromotionFulfillment,
  fact: FulfillmentFact | null,
): boolean {
  return fulfillmentRankOf(fulfillment, fact) !== null;
}

/** « Tous » d'un côté coché. */
const ALL_RANK = 1;
/** Un point ou une zone nommé : plus spécifique que « tous ». */
const LISTED_RANK = 2;
/** « Dans le prix affiché » : aucun critère d'acheminement. */
const DISPLAYED_PRICE_RANK = 0;

/**
 * **Le rang d'acheminement POUR CE FAIT** (plan des acheminements, § 8.3) —
 * `null` = l'acheminement n'admet pas ce fait. Point nommé ou zone nommée = 2 ;
 * tous les points ou toutes les zones = 1 ; « dans le prix affiché » = 0.
 *
 * Calculé par fait, jamais par promotion : A = {point P1, toutes les zones}
 * et B = {tous les points, zone Z} se rangent B avant A en Z, et A avant B en
 * P1. Deux promotions disjointes ne se comparent donc jamais, et les formes
 * d'avant gardent leur départage (un point, 2 ; un mode, 1).
 */
export function fulfillmentRankOf(
  fulfillment: PromotionFulfillment,
  fact: FulfillmentFact | null,
): number | null {
  if (fulfillment.kind === "displayed_price") {
    return DISPLAYED_PRICE_RANK;
  }
  if (fact === null) {
    return null;
  }
  if (fact.method === "pickup") {
    const { pickup } = fulfillment;
    if (pickup === "none") {
      return null;
    }
    if (pickup === "all") {
      return ALL_RANK;
    }
    return fact.pickupId !== null && pickup.points.includes(fact.pickupId) ? LISTED_RANK : null;
  }
  const { delivery } = fulfillment;
  if (delivery === "none") {
    return null;
  }
  if (delivery === "all") {
    return ALL_RANK;
  }
  return fact.zoneId !== null && delivery.zones.includes(fact.zoneId) ? LISTED_RANK : null;
}

/**
 * **Le rang du public**, du plus fort au plus faible (§ 13.3). `company` 4
 * bat tous les publics de clientèle, même moins généreuse : la négociation
 * nominative prime (Q5).
 */
export const PUBLIC_RANK: Readonly<Record<PromotionAudienceKind, number>> = {
  company: 4,
  company_and_sites: 3,
  individuals_guest: 2,
  individuals_registered: 2,
  pros_active: 2,
  pros_pending: 2,
  individuals: 1,
  pros: 1,
  everyone_but_active_pros: 1,
  everyone: 0,
};
