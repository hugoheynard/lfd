import {
  PromotionBlankTextError,
  PromotionEffectPointMismatchError,
  PromotionLineOnlyOptionError,
  PromotionMissingTargetIdError,
  PromotionProductTargetAtLineError,
  PromotionReversedWindowError,
} from "./errors/promotion-errors.js";
import { PromotionAudienceLabelWithoutAudienceError } from "./errors/promotion-audience-errors.js";
import type { LabelAudience, PromotionAudienceSet } from "./promotion-audience-set.js";
import { assertCondition, type PromotionCondition } from "./promotion-condition.js";
import {
  EFFECTS_AT,
  assertEffectValue,
  assertOwnFloor,
  type PromotionEffect,
  type PromotionOwnFloor,
} from "./promotion-effect.js";
import {
  applicationPointOf,
  fulfillmentPickupIdOf,
  type PromotionFulfillment,
} from "./promotion-fulfillment.js";
import type { PromotionScope } from "./promotion-scope.js";
import { assertScope } from "./promotion-scope-checks.js";

import type { PromotionAudienceLabels, PromotionLabel } from "./promotion-labels.js";

export type { PromotionLabel } from "./promotion-labels.js";

/**
 * **La fenêtre d'une promotion** : borne basse incluse, borne haute exclue,
 * `null` = sans fin. Une décision qui entrera dans la résolution du prix porte
 * sa fenêtre (`lint:dated-decisions`), sans quoi une lecture datée lui
 * appliquerait les valeurs d'aujourd'hui.
 */
export interface PromotionWindow {
  readonly validFrom: Date;
  readonly validTo: Date | null;
}

/**
 * **Ce qu'une promotion dit** — les termes qu'on pose et qu'on révise, sans
 * l'identité ni le cycle de vie. Sept blocs, ceux de l'éditeur (§ 13.9) :
 * identité, effet, fenêtre, public, acheminement, portée, conditions.
 */
export interface PromotionTerms extends PromotionWindow {
  readonly internalName: string;
  /** Le libellé COMMUN — le repli de chaque audience (§ 15.4). */
  readonly label: PromotionLabel;
  /** Les libellés Particuliers / Pros, facultatifs (§ 15.12 Q2). */
  readonly audienceLabels: PromotionAudienceLabels;
  /** Le motif ; `null` = aucun. */
  readonly reason: string | null;
  readonly effect: PromotionEffect;
  /** `null` = le plancher de la plateforme. Point ligne seulement. */
  readonly ownFloor: PromotionOwnFloor | null;
  /** Point ligne seulement : au panier, la mercuriale ne scelle rien (§ 13.2). */
  readonly stacksOverMercuriale: boolean;
  /** Le public, en forme canonique (§ 15.4) — au moins une cible. */
  readonly audiences: PromotionAudienceSet;
  readonly fulfillment: PromotionFulfillment;
  readonly scope: PromotionScope;
  readonly conditions: readonly PromotionCondition[];
}

/**
 * **Tous les invariants des termes**, miroir des CHECK de la table (§ 13.3)
 * plus ceux que le SQL ne voit pas (portée). Appelée à la pose, à la
 * révision ET à la relecture.
 *
 * @throws {PromotionBlankTextError} nom interne ou libellé vide.
 * @throws {PromotionReversedWindowError} fin avant le début.
 * @throws {PromotionEffectPointMismatchError} effet étranger au point d'application.
 * @throws {PromotionLineOnlyOptionError} plancher propre ou cumul sur mercuriale au panier.
 * @throws {PromotionProductTargetAtLineError} un produit entier visé au point ligne.
 * @throws {PromotionAudienceLabelWithoutAudienceError} un libellé d'audience que le public ne touche pas.
 * @throws les refus de `assertEffectValue`, `assertOwnFloor`, `assertScope`, `assertCondition`.
 */
export function assertTerms(terms: PromotionTerms): void {
  assertText("nom interne", terms.internalName);
  assertText("libellé", terms.label.fr);
  assertOptionalText("libellé anglais", terms.label.en);
  assertOptionalText("libellé italien", terms.label.it);
  assertAudienceLabels(terms);
  assertOptionalText("motif", terms.reason);
  if (terms.validTo !== null && terms.validTo.getTime() <= terms.validFrom.getTime()) {
    throw new PromotionReversedWindowError(terms.validFrom, terms.validTo);
  }
  assertTargets(terms);
  const point = applicationPointOf(terms.fulfillment);
  assertEffectValue(terms.effect);
  if (!EFFECTS_AT[point].includes(terms.effect.kind)) {
    throw new PromotionEffectPointMismatchError(terms.effect.kind, point);
  }
  if (terms.ownFloor !== null) {
    if (point === "basket") {
      throw new PromotionLineOnlyOptionError("own_floor");
    }
    assertOwnFloor(terms.ownFloor);
  }
  if (terms.stacksOverMercuriale && point === "basket") {
    throw new PromotionLineOnlyOptionError("stacks_over_mercuriale");
  }
  assertScope(terms.scope);
  const product = terms.scope.rules.find((rule) => rule.target === "product");
  if (point === "line" && product !== undefined) {
    throw new PromotionProductTargetAtLineError(product.targetId);
  }
  terms.conditions.forEach(assertCondition);
}

const AUDIENCE_NAMES: Readonly<Record<LabelAudience, string>> = {
  individuals: "Particuliers",
  pros: "Pros",
};

/**
 * Un libellé d'audience n'existe que si le public touche cette audience, et
 * son français n'est pas vide (§ 15.4).
 *
 * @throws {PromotionAudienceLabelWithoutAudienceError} libellé d'une audience non visée.
 * @throws {PromotionBlankTextError} libellé d'audience vide.
 */
function assertAudienceLabels(terms: PromotionTerms): void {
  for (const audience of ["individuals", "pros"] as const) {
    const label = terms.audienceLabels[audience];
    if (label === null) {
      continue;
    }
    if (!terms.audiences.touches(audience)) {
      throw new PromotionAudienceLabelWithoutAudienceError(audience);
    }
    const name = AUDIENCE_NAMES[audience];
    assertText(`libellé ${name}`, label.fr);
    assertOptionalText(`libellé ${name} anglais`, label.en);
    assertOptionalText(`libellé ${name} italien`, label.it);
  }
}

/**
 * Les sociétés du public sont tenues par `PromotionAudienceSet` à sa
 * construction ; reste le point de retrait.
 *
 * @throws {PromotionMissingTargetIdError} un point nommé à vide.
 */
function assertTargets(terms: PromotionTerms): void {
  if (fulfillmentPickupIdOf(terms.fulfillment)?.trim() === "") {
    throw new PromotionMissingTargetIdError("pickup_point");
  }
}

function assertText(field: string, value: string): void {
  if (value.trim() === "") {
    throw new PromotionBlankTextError(field);
  }
}

function assertOptionalText(field: string, value: string | null): void {
  if (value !== null) {
    assertText(field, value);
  }
}
