import { describeDay } from "../pricing-act-summary.js";
import type { PricingTier } from "../pricing-grid.js";
import { volumeQuantityOf } from "../price-rule.js";
import type { PriceRule, PricingContext } from "../price-rule.js";
import { suspendedFromOf, type RuleLifecycle } from "../rule-lifecycle.js";
import type { AmendedGrid, LineSegment } from "./mercuriale-amendment.js";
import { segmentAt } from "./mercuriale-segments.js";
import { admissionAt, type PromotionAdmission } from "./mercuriale-promotion-policy.js";

/*
 * La mercuriale lue comme la RÈGLE de son étage — séparée de l'agrégat pour
 * que celui-ci ne porte que ses gestes. `CompanyMercuriale.asRuleFor` et
 * `missesTierFor` délèguent ici.
 */

/** Ce que la lecture comme règle demande de la mercuriale. */
export interface RuledMercuriale extends AmendedGrid {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  readonly lifecycle: RuleLifecycle;
  /** La politique de promotions de départ ; les avenants en portent les suivantes. */
  readonly promotionPolicy: PromotionAdmission;
}

/**
 * **La mercuriale vue comme la règle de son étage**, pour CET article et à la
 * mesure de CE contexte. `null` quand elle ne porte pas l'article, ou quand la
 * mesure n'atteint aucun palier — l'étage est alors transparent, exactement
 * comme lorsqu'aucune règle ne s'applique.
 *
 * ## Pourquoi ici, et pas dans le lecteur
 *
 * Parce qu'il faut la **mesure**, et qu'un lecteur ne l'a pas : il charge une
 * fois pour tout un panier, dont chaque ligne a sa propre quantité. C'est la
 * décision qu'a prise le barème de volume avant nous : `ladderAsRule` n'est
 * appelé par **aucun** lecteur, ses quatre appelants convertissent chacun au
 * moment où ils connaissent la quantité (vérifié le 2026-09-08).
 *
 * Et ce n'est pas une préférence : convertir trop tôt ne casse pas, ça
 * **ment**. La projection charge ses candidats une fois puis résout à N
 * quantités ; une mercuriale figée au premier palier y rendrait une courbe
 * plate, et une courbe plate se lit comme une réponse.
 *
 * ## 🔴 Au plus UNE règle
 *
 * Toutes les règles issues d'une mercuriale portent `id = mercuriale.id`. En
 * rendre deux — deux paliers du même article — recréerait l'ambiguïté qui a
 * déjà coûté un 400 sur une commande de 20 à l'étage volume. Le palier est
 * donc choisi ici, pas laissé à la résolution.
 *
 * ## La mesure est le CUMUL, pas la commande
 *
 * `volumeQuantityOf` rend `cumulativeQuantity ?? quantity`, et c'est ce que
 * `applies` mesure pour cet étage. Un client sous engagement obtient donc le
 * palier qu'il a négocié dès sa première commande — c'est tout l'objet de
 * l'engagement.
 *
 * ## Le compte de tarif, pas la société servie
 *
 * Un sous-compte qui suit le tarif de son principal paie la mercuriale du
 * principal (`sous-comptes.md`, §2.2). Elle ne vaut donc que pour le
 * compte de tarif du contexte (`pricingCompanyId`), et la règle rendue vise
 * la société servie : c'est à elle que la résolution confronte l'audience.
 * Une mercuriale d'un autre compte ne rend rien.
 *
 * ## Sa politique de promotions voyage avec elle
 *
 * La règle porte ce que la mercuriale laisse passer À L'INSTANT DU CONTEXTE
 * (`plan-la-mercuriale-decide.md`, § 8) : une lecture datée lit l'entrée de
 * sa date, jamais le réglage d'aujourd'hui : celle du dernier avenant qui en
 * porte une, sinon celle du document. Un site, qui paie la mercuriale de son
 * principal, en suit aussi la politique.
 */
export function mercurialeRuleFor(
  mercuriale: RuledMercuriale,
  context: PricingContext,
): PriceRule | null {
  if (context.pricingCompanyId !== mercuriale.companyId || context.companyId === null) {
    return null;
  }
  const segment = segmentFor(mercuriale, context);
  if (segment === null) {
    return null;
  }
  const { line } = segment;
  const tier = highestTierReached(line.tiers, volumeQuantityOf(context));
  if (tier === null) {
    return null;
  }
  return {
    id: mercuriale.id,
    stage: "mercuriale",
    scope: { type: "product", id: line.sku },
    audience: { type: "company", id: context.companyId },
    minQuantity: tier.minQuantity,
    // La fenêtre de la LIGNE : celle du document pour la grille, celle de
    // l'avenant coupée par le document, et l'une ou l'autre coupée par un
    // arrêt. L'id reste celui du document (seconde contradiction, B1) : le
    // scellement « a facturé » cherche des ids de documents.
    validFrom: segment.from,
    validTo: segment.to,
    // Une pause du document suspend ses avenants (Q3).
    suspendedFrom: suspendedFromOf(mercuriale.lifecycle),
    label: labelOf(mercuriale, segment),
    // Une mercuriale ne franchit pas son propre scellement — l'agrégat des
    // règles le refuse, et le dire ici évite qu'on se demande.
    stacksOverMercuriale: false,
    promotionAdmission: admissionAt(mercuriale, context.at),
    nature: "replace",
    amountMillicents: tier.unitPriceMillicents,
  };
}

/**
 * La grille **porte cet article** mais aucun palier n'est atteint à cette
 * mesure — le seul `null` de {@link mercurialeRuleFor} qui soit une décision.
 *
 * 🔴 Il existe parce que `asRuleFor` rend `null` pour **deux** raisons, et que
 * les confondre écrirait « palier non atteint » sur chaque ligne de chaque
 * commande d'un client sous mercuriale, pour tout article hors grille — un
 * motif faux, en volume non borné, sur l'écran fait pour le litige (R25).
 *
 * L'article hors grille n'est pas une règle écartée : la mercuriale n'avait
 * rien à en dire.
 */
export function mercurialeMissesTier(
  mercuriale: RuledMercuriale,
  context: PricingContext,
): boolean {
  // Une mercuriale d'un autre compte n'a rien à dire, même pas « palier non
  // atteint » (cf. `mercurialeRuleFor`).
  if (context.pricingCompanyId !== mercuriale.companyId) {
    return false;
  }
  const segment = segmentFor(mercuriale, context);
  if (segment === null) {
    return false;
  }
  const measured = volumeQuantityOf(context);
  return !segment.line.tiers.some((tier) => measured >= tier.minQuantity);
}

/**
 * **La ligne qui parle pour cet article à cet instant** — grille ou avenant,
 * arrêts compris. Partagée par {@link mercurialeRuleFor} et {@link mercurialeMissesTier},
 * pour qu'ils ne divergent pas. La portée d'une mercuriale est l'ARTICLE :
 * `pricingContextFor` renseigne `productSku` et `variantSku` avec le même
 * sku, lire l'un des deux suffit et dit lequel fait foi.
 */
export function segmentFor(
  mercuriale: RuledMercuriale,
  context: PricingContext,
): LineSegment | null {
  return segmentAt(mercuriale, context.productSku, context.at);
}

/** « Mercuriale 2027 — avenant du 1er novembre 2026 » : la pièce d'où vient le prix. */
function labelOf(mercuriale: RuledMercuriale, segment: LineSegment): string {
  return segment.amendment === null
    ? mercuriale.label
    : `${mercuriale.label} — avenant du ${describeDay(segment.amendment.validFrom)}`;
}

/**
 * Le PLUS HAUT palier atteint gagne — les paliers sont triés croissants par
 * l'agrégat, donc le dernier qui passe est le bon.
 */
function highestTierReached(tiers: readonly PricingTier[], measured: number): PricingTier | null {
  let reached: PricingTier | null = null;
  for (const candidate of tiers) {
    if (measured >= candidate.minQuantity) {
      reached = candidate;
    }
  }
  return reached;
}
