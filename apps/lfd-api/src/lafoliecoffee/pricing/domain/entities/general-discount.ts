import { decidingScopeRule } from "../../../promotions/domain/promotion-scope.js";
import {
  DuplicateGeneralDiscountTargetError,
  GeneralDiscountBaseRateError,
  GeneralDiscountIncludesNothingError,
  InvalidGeneralDiscountError,
} from "../pricing-errors.js";
import type { PricingContext } from "../price-rule.js";

/*
 * **La remise générale d'une mercuriale** — « −40 % sur le pain, −30 % sur le
 * reste, sauf le chocolat » (`documentation/pricing/mercuriales/plan-remise-generale.md`,
 * « Un taux par famille », § 1 et § 2).
 *
 * Un pourcentage du prix de base du jour : contrairement au prix ferme, elle
 * SUIT le catalogue, et c'est voulu. Chaque ligne porte son taux, et la
 * décision la plus précise gagne — déclinaison, puis famille la plus proche,
 * puis le taux de base du mode —, par la recherche même de la portée des
 * promotions (`decidingScopeRule`). Pas de cible « produit » : la chaîne de
 * prix ne connaît que le SKU de l'article.
 */

/** Plus petit taux admis : 1 point de base, 0,01 %. */
const MIN_GENERAL_DISCOUNT_BP = 1;
/** Plus grand taux admis : 9 999 points de base, 99,99 %. */
const MAX_GENERAL_DISCOUNT_BP = 9_999;

/** Une ligne de la remise : une famille ou une déclinaison, et son taux. */
export interface GeneralDiscountRule {
  readonly target: "category" | "variant";
  readonly targetId: string;
  /** En points de base, 1 à 9 999. `null` = exclue. */
  readonly bp: number | null;
}

/** Une remise générale, sans palier de quantité (D6). */
export interface GeneralDiscount {
  readonly mode: "all_except" | "only";
  /** Le taux de base (1 à 9 999 pb). Présent en `all_except`, `null` en `only`. */
  readonly baseBp: number | null;
  readonly rules: readonly GeneralDiscountRule[];
}

/**
 * Ce qu'un avenant dit de la remise générale : `{ set: null }` l'arrête, une
 * valeur la remplace ; un avenant qui n'en porte pas n'en dit rien.
 */
export interface GeneralDiscountChange {
  readonly set: GeneralDiscount | null;
}

/**
 * La remise en forme vérifiée.
 *
 * @throws {InvalidGeneralDiscountError} un taux hors ]0 ; 100 %[ ou non entier.
 * @throws {GeneralDiscountBaseRateError} `all_except` sans taux de base, ou `only` avec.
 * @throws {GeneralDiscountIncludesNothingError} `only` sans aucune ligne à taux.
 * @throws {DuplicateGeneralDiscountTargetError} deux lignes sur la même cible.
 */
export function checkedGeneralDiscount(discount: GeneralDiscount): GeneralDiscount {
  const { mode, baseBp, rules } = discount;
  if ((mode === "all_except") !== (baseBp !== null)) {
    throw new GeneralDiscountBaseRateError(mode);
  }
  for (const bp of [baseBp, ...rules.map((rule) => rule.bp)]) {
    assertRate(bp);
  }
  if (mode === "only" && !rules.some((rule) => rule.bp !== null)) {
    throw new GeneralDiscountIncludesNothingError();
  }
  const seen = new Set<string>();
  for (const rule of rules) {
    const key = `${rule.target}:${rule.targetId}`;
    if (seen.has(key)) {
      throw new DuplicateGeneralDiscountTargetError(rule.targetId);
    }
    seen.add(key);
  }
  return { mode, baseBp, rules: rules.map((rule) => ({ ...rule })) };
}

function assertRate(bp: number | null): void {
  if (
    bp !== null &&
    (!Number.isInteger(bp) || bp < MIN_GENERAL_DISCOUNT_BP || bp > MAX_GENERAL_DISCOUNT_BP)
  ) {
    throw new InvalidGeneralDiscountError(bp);
  }
}

/** Ce que la lecture datée demande du document et de ses avenants. */
export interface DiscountedGrid {
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly generalDiscount: GeneralDiscount | null;
  readonly amendments: readonly {
    readonly validFrom: Date;
    readonly validTo: Date | null;
    readonly archivedAt: Date | null;
    readonly generalDiscount?: GeneralDiscountChange | undefined;
  }[];
}

/** La remise qui parle à un instant, sur la fenêtre de la pièce qui la porte. */
export interface SpeakingGeneralDiscount {
  readonly discount: GeneralDiscount;
  readonly from: Date;
  readonly to: Date | null;
}

/**
 * **La remise générale qui parle à cette date** (§ 2.1) : celle de l'avenant
 * qui en dit quelque chose et dont la FENÊTRE couvre l'instant — le plus
 * récent en date d'effet, à date égale le dernier écrit —, sinon celle du
 * document. `null` : aucune, ou un avenant l'arrête sur sa fenêtre.
 *
 * Ce n'est PAS la règle de `admissionAt` : la politique de promotions d'un
 * avenant court jusqu'au suivant, la remise d'un avenant ne vaut que sur
 * `[validFrom, validTo)` — après, celle d'avant reparle. Un « −20 % du 1er au
 * 31 » ne laisse pas −20 % pour toujours.
 *
 * Un avenant rangé APRÈS `at` compte encore (relecture datée), comme pour la
 * politique de promotions.
 */
export function generalDiscountAt(grid: DiscountedGrid, at: Date): SpeakingGeneralDiscount | null {
  const instant = at.getTime();
  let speaking: {
    readonly change: GeneralDiscountChange;
    readonly from: Date;
    readonly to: Date | null;
  } | null = null;
  for (const amendment of grid.amendments) {
    const change = amendment.generalDiscount;
    const to = earliest(amendment.validTo, grid.validTo);
    const live = amendment.archivedAt === null || amendment.archivedAt.getTime() > instant;
    const covers =
      amendment.validFrom.getTime() <= instant && (to === null || instant < to.getTime());
    if (change !== undefined && live && covers) {
      if (speaking === null || amendment.validFrom.getTime() >= speaking.from.getTime()) {
        speaking = { change, from: amendment.validFrom, to };
      }
    }
  }
  if (speaking !== null) {
    return speaking.change.set === null
      ? null
      : { discount: speaking.change.set, from: speaking.from, to: speaking.to };
  }
  return grid.generalDiscount === null
    ? null
    : { discount: grid.generalDiscount, from: grid.validFrom, to: grid.validTo };
}

/**
 * **Le taux que la remise applique à l'article du contexte**, ou `null` :
 * celui de la décision la plus précise — déclinaison, puis famille la plus
 * proche, puis le taux de base du mode (`null` en « seulement »). Une ligne
 * sans taux exclut, et rien de plus lointain ne la contredit. Les articles au
 * poids sont couverts comme les autres (D4) : un pourcentage sans seuil se lit
 * aussi bien sur un prix au kilo.
 */
export function generalDiscountBpFor(
  discount: GeneralDiscount,
  context: PricingContext,
): number | null {
  const decision = decidingScopeRule(discount.rules, {
    sku: context.variantSku,
    productId: null,
    categoryPath: context.categoryPath,
  });
  return decision === null ? discount.baseBp : decision.rule.bp;
}

function earliest(left: Date | null, right: Date | null): Date | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left.getTime() <= right.getTime() ? left : right;
}
