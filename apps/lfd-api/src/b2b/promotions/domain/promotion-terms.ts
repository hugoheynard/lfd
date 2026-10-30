import {
  PromotionBlankTextError,
  PromotionEffectPointMismatchError,
  PromotionLineOnlyOptionError,
  PromotionMissingTargetIdError,
  PromotionProductTargetAtLineError,
  PromotionReversedWindowError,
} from "./errors/promotion-errors.js";
import { audienceCompanyIdOf, type PromotionAudience } from "./promotion-audience.js";
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

/** Le libellé montré au client ; anglais et italien `null` = repli sur le français. */
export interface PromotionLabel {
  readonly fr: string;
  readonly en: string | null;
  readonly it: string | null;
}

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
  readonly label: PromotionLabel;
  /** Le motif ; `null` = aucun. */
  readonly reason: string | null;
  readonly effect: PromotionEffect;
  /** `null` = le plancher de la plateforme. Point ligne seulement. */
  readonly ownFloor: PromotionOwnFloor | null;
  /** Point ligne seulement : au panier, la mercuriale ne scelle rien (§ 13.2). */
  readonly stacksOverMercuriale: boolean;
  readonly audience: PromotionAudience;
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
 * @throws les refus de `assertEffectValue`, `assertOwnFloor`, `assertScope`, `assertCondition`.
 */
export function assertTerms(terms: PromotionTerms): void {
  assertText("nom interne", terms.internalName);
  assertText("libellé", terms.label.fr);
  assertOptionalText("libellé anglais", terms.label.en);
  assertOptionalText("libellé italien", terms.label.it);
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

/** @throws {PromotionMissingTargetIdError} une société ou un point nommé à vide. */
function assertTargets(terms: PromotionTerms): void {
  if (audienceCompanyIdOf(terms.audience)?.trim() === "") {
    throw new PromotionMissingTargetIdError("company");
  }
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
