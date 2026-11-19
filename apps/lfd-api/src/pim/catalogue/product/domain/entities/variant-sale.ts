import {
  InvalidVariantPricingError,
  ZeroPricePerKgError,
} from "../errors/variant-pricing-errors.js";
import {
  DefaultVariantCannotFollowMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../errors/min-quantity-errors.js";
import {
  SaleReferenceInUseError,
  SaleReferenceUsageUnknownError,
} from "../errors/sale-unit-errors.js";
import {
  isEmptyMinQuantities,
  sameMinQuantities,
  type MinQuantities,
} from "../value-objects/min-quantities.js";
import type { SaleUnitClearance } from "../value-objects/sale-reference-usage.js";
import {
  PIECE_SALE_TERMS,
  saleTerms,
  type SaleTerms,
  type SaleUnit,
} from "../value-objects/sale-terms.js";
import type { VariantPricing, VariantSnapshot } from "./variant-snapshot.js";

/** Tout ce que « se vendre » pose sur une déclinaison, tel que la persistance le range. */
export interface SaleFields {
  readonly priceCents: number | null;
  readonly weightGrams: number | null;
  readonly proPriceMillicents: number | null;
  readonly proPricePerKgMillicents: number | null;
  readonly publicPricePerKgTtcCents: number | null;
  readonly pricePerKgShownPublic: boolean;
  readonly pricePerKgShownPro: boolean;
  readonly terms: SaleTerms;
  readonly minQuantities: MinQuantities;
  readonly minQuantityFollowsDefault: boolean;
  readonly followsPricing: boolean;
}

/**
 * **Comment une déclinaison se vend** — prix public et pro, poids, prix au
 * kilo, unité (pièce ou poids), quantité minimale, et les drapeaux « suit le
 * tarif / le minimum du défaut ». Un value object immuable : chaque geste rend
 * le nouvel état, ou refuse sans rien changer.
 *
 * `priceCents` EST un prix public TTC : il n'y a qu'une assiette, et le hors
 * taxe se déduit du taux de chaque canal à la projection. Le prix et le poids
 * voyagent ensemble — un prix hérité au-dessus d'un poids propre décrirait un
 * article que personne ne vend.
 *
 * Les refus qui nomment la déclinaison (`sku`) lui sont passés : ils sont lus
 * par du personnel qui n'a pas le code sous les yeux.
 */
export class VariantSale {
  private constructor(readonly fields: SaleFields) {}

  /** Les champs facultatifs à la LECTURE sont déjà posés par l'instantané. */
  static fromSnapshot(snapshot: VariantSnapshot): VariantSale {
    return new VariantSale({
      priceCents: snapshot.priceCents,
      weightGrams: snapshot.weightGrams,
      proPriceMillicents: snapshot.proPriceMillicents,
      proPricePerKgMillicents: snapshot.proPricePerKgMillicents,
      publicPricePerKgTtcCents: snapshot.publicPricePerKgTtcCents,
      pricePerKgShownPublic: snapshot.pricePerKgShownPublic,
      pricePerKgShownPro: snapshot.pricePerKgShownPro,
      terms: {
        saleUnit: snapshot.saleUnit,
        weightMinGrams: snapshot.weightMinGrams,
        weightStepGrams: snapshot.weightStepGrams,
      },
      minQuantities: snapshot.minQuantities,
      minQuantityFollowsDefault: snapshot.minQuantityFollowsDefault,
      followsPricing: snapshot.pricingFollowsDefault,
    });
  }

  /** L'unité dans laquelle elle se vend — la sienne, jamais celle du défaut. */
  get saleUnit(): SaleUnit {
    return this.fields.terms.saleUnit;
  }

  /** A-t-elle un prix pro HT À ELLE — sans regarder le défaut ? */
  get hasOwnProPrice(): boolean {
    return this.fields.proPriceMillicents !== null;
  }

  /** Suit le tarif du défaut — prix ET poids — plutôt que le sien ? */
  get followsPricing(): boolean {
    return this.fields.followsPricing;
  }

  /** (Dés)aligne le tarif. Le drapeau seul bouge : le tarif propre dort, et se retrouve au désalignement. */
  alignPricing(aligned: boolean): VariantSale {
    return new VariantSale({ ...this.fields, followsPricing: aligned });
  }

  /**
   * Tarif et poids en un geste, tels que le back-office les saisit. Chaque champ
   * optionnel : **absent = inchangé**, `null` = effacer — les écrans et les
   * semis d'avant le prix pro n'envoient pas ce champ, et l'absence ne doit pas
   * effacer une saisie.
   *
   * Les prix au kilo sont informatifs et indépendants de tout autre : un poids
   * changé n'y touche pas, rien ne les calcule. `> 0` : un kilo à zéro
   * s'afficherait « 0,00 € / kg ».
   *
   * @param clearance la réponse du commerce, lue par le handler AVANT l'appel :
   *   absente ou sans réponse, un changement d'unité est refusé.
   * @throws {InvalidVariantPricingError} centimes ou grammes non entiers ou négatifs.
   * @throws {ZeroPricePerKgError} un prix au kilo à zéro.
   * @throws {SaleReferenceInUseError} l'unité change alors que la référence a déjà servi.
   */
  price(input: VariantPricing, sku: string, clearance?: SaleUnitClearance): VariantSale {
    const f = this.fields;
    const priceCents = requireCountOrNull("priceCents", input.priceCents);
    const weightGrams = requireCountOrNull("weightGrams", input.weightGrams);
    const proPriceMillicents =
      input.proPrice === undefined ? f.proPriceMillicents : (input.proPrice?.millicents ?? null);
    return new VariantSale({
      ...f,
      priceCents,
      weightGrams,
      proPriceMillicents,
      ...pricePerKgOf(input, f),
      terms: termsOf(input, f.terms, sku, clearance),
    });
  }

  /**
   * **Pose sa quantité minimale** — une paire pro/public, ou `"follow"` pour
   * suivre celle du défaut. Poser une paire cesse de suivre ; suivre garde la
   * paire propre, qui dort. Au poids, seule la paire vide passe : son minimum
   * est en grammes, et suivre celui d'un défaut à la pièce l'en doterait en
   * douce.
   *
   * @returns le nouvel état, et si quelque chose a changé.
   * @throws {DefaultVariantCannotFollowMinQuantityError} le défaut ne se suit pas.
   * @throws {MinQuantityOnWeightSaleError} un minimum en pièces sur une vente au poids.
   */
  changeMinQuantities(
    next: MinQuantities | "follow",
    owner: { readonly isDefault: boolean; readonly sku: string },
  ): { readonly sale: VariantSale; readonly changed: boolean } {
    const f = this.fields;
    if (next === "follow") {
      if (owner.isDefault) {
        throw new DefaultVariantCannotFollowMinQuantityError(owner.sku);
      }
      this.refuseOnWeight(true, owner.sku);
      return {
        sale: new VariantSale({ ...f, minQuantityFollowsDefault: true }),
        changed: !f.minQuantityFollowsDefault,
      };
    }
    this.refuseOnWeight(!isEmptyMinQuantities(next), owner.sku);
    return {
      sale: new VariantSale({ ...f, minQuantities: next, minQuantityFollowsDefault: false }),
      changed: f.minQuantityFollowsDefault || !sameMinQuantities(f.minQuantities, next),
    };
  }

  /**
   * Devient celle du défaut : elle ne se suit plus, donc le tarif et le minimum
   * qu'elle suivait passent en PROPRE avec ce qu'elle voyait (`resolved`,
   * résolu AVANT la bascule).
   */
  promote(resolved: VariantSnapshot): VariantSale {
    const f = this.fields;
    const pricing = f.followsPricing
      ? {
          priceCents: resolved.priceCents,
          weightGrams: resolved.weightGrams,
          proPriceMillicents: resolved.proPriceMillicents,
          proPricePerKgMillicents: resolved.proPricePerKgMillicents,
          publicPricePerKgTtcCents: resolved.publicPricePerKgTtcCents,
          pricePerKgShownPublic: resolved.pricePerKgShownPublic,
          pricePerKgShownPro: resolved.pricePerKgShownPro,
        }
      : {};
    return new VariantSale({
      ...f,
      ...pricing,
      minQuantities: f.minQuantityFollowsDefault ? resolved.minQuantities : f.minQuantities,
      followsPricing: false,
      minQuantityFollowsDefault: false,
    });
  }

  private refuseOnWeight(setsSomething: boolean, sku: string): void {
    if (setsSomething && this.saleUnit === "weight") {
      throw new MinQuantityOnWeightSaleError(sku);
    }
  }
}

/** Les prix au kilo et leur visibilité : chacun **absent = inchangé**. */
function pricePerKgOf(
  input: VariantPricing,
  current: SaleFields,
): Pick<
  SaleFields,
  | "proPricePerKgMillicents"
  | "publicPricePerKgTtcCents"
  | "pricePerKgShownPublic"
  | "pricePerKgShownPro"
> {
  return {
    proPricePerKgMillicents:
      input.proPricePerKg === undefined
        ? current.proPricePerKgMillicents
        : requirePositiveOrNull("proPricePerKg", input.proPricePerKg?.millicents ?? null),
    publicPricePerKgTtcCents:
      input.publicPricePerKgTtcCents === undefined
        ? current.publicPricePerKgTtcCents
        : requirePositiveOrNull("publicPricePerKgTtcCents", input.publicPricePerKgTtcCents),
    pricePerKgShownPublic: input.pricePerKgShownPublic ?? current.pricePerKgShownPublic,
    pricePerKgShownPro: input.pricePerKgShownPro ?? current.pricePerKgShownPro,
  };
}

/**
 * L'unité de vente, le pas et le minimum. L'unité change librement tant que sa
 * référence de vente n'a servi nulle part — même publiée ; le pas et le
 * minimum, eux, restent réglables. Ils suivent l'unité : en changer sans les
 * nommer repart de rien, plutôt que de traîner ceux de l'autre unité.
 */
function termsOf(
  input: VariantPricing,
  current: SaleTerms,
  sku: string,
  clearance: SaleUnitClearance | undefined,
): SaleTerms {
  if (
    input.saleUnit === undefined &&
    input.weightMinGrams === undefined &&
    input.weightStepGrams === undefined
  ) {
    return current;
  }
  const saleUnit = input.saleUnit ?? current.saleUnit;
  const carried = saleUnit === current.saleUnit ? current : PIECE_SALE_TERMS;
  const next = saleTerms({
    saleUnit,
    weightMinGrams:
      input.weightMinGrams === undefined ? carried.weightMinGrams : input.weightMinGrams,
    weightStepGrams:
      input.weightStepGrams === undefined ? carried.weightStepGrams : input.weightStepGrams,
  });
  if (next.saleUnit !== current.saleUnit) {
    ensureUnused(sku, clearance);
  }
  return next;
}

/**
 * @throws {SaleReferenceUsageUnknownError} le commerce n'a pas répondu.
 * @throws {SaleReferenceInUseError} la référence a déjà servi.
 */
function ensureUnused(sku: string, clearance: SaleUnitClearance | undefined): void {
  if (clearance === undefined || !clearance.answered) {
    throw new SaleReferenceUsageUnknownError(
      sku,
      clearance === undefined ? undefined : clearance.cause,
    );
  }
  if (clearance.uses.length > 0) {
    throw new SaleReferenceInUseError(sku, clearance.uses);
  }
}

/** Les centimes et les grammes sont des ENTIERS positifs — ou rien. */
function requireCountOrNull(field: string, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidVariantPricingError(field, value);
  }
  return value;
}

/** Un prix au kilo est un entier STRICTEMENT positif — ou rien. */
function requirePositiveOrNull(field: string, value: number | null): number | null {
  const count = requireCountOrNull(field, value);
  if (count === 0) {
    throw new ZeroPricePerKgError(field);
  }
  return count;
}
