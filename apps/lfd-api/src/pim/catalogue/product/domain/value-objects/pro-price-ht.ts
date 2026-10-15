import { InvalidProPriceError } from "../errors/product-errors.js";

/** 10⁻⁵ € : l'unité du fil et de `catalog_items.price_millicents`. */
export const PRO_PRICE_DECIMALS = 5;
const MILLICENTS_PER_EURO = 10 ** PRO_PRICE_DECIMALS;

/**
 * Le plafond d'une colonne Postgres `INTEGER` — 21 474,83647 €. Au-delà, la
 * base refuserait l'écriture par une erreur technique ; le refus doit être
 * métier, et dit avant.
 */
export const MAX_PRO_PRICE_MILLICENTS = 2_147_483_647;

/** Des chiffres, et au plus une partie décimale — point ou virgule. */
const EURO_AMOUNT = /^(\d+)(?:[.,](\d+))?$/u;

/**
 * **Le prix professionnel HORS TAXE saisi** — lot P de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md` (P2).
 *
 * Saisi en euros avec **au plus cinq décimales**, rangé en millicentimes
 * entiers. La conversion se fait sur le TEXTE, chiffre par chiffre, et jamais
 * par une multiplication flottante : `1.00001 * 100000` ne tombe pas juste en
 * binaire, et un prix qui dérive au cinquième chiffre se facture.
 *
 * Une sixième décimale est **refusée**, pas arrondie : arrondir déciderait à la
 * place de celui qui saisit un montant qu'il n'a pas tapé.
 */
export class ProPriceHt {
  private constructor(readonly millicents: number) {}

  /** La saisie du back-office : `"12.34567"`, `"12,5"`, `"3"`. */
  static fromEuros(raw: string): ProPriceHt {
    const match = EURO_AMOUNT.exec(raw.trim());
    if (match === null) {
      throw new InvalidProPriceError(raw, "un montant en euros, chiffres et séparateur décimal");
    }
    const [, units = "", decimals = ""] = match;
    if (decimals.length > PRO_PRICE_DECIMALS) {
      throw new InvalidProPriceError(raw, `au plus ${PRO_PRICE_DECIMALS} décimales`);
    }
    const millicents =
      Number(units) * MILLICENTS_PER_EURO + Number(decimals.padEnd(PRO_PRICE_DECIMALS, "0"));
    return ProPriceHt.fromMillicents(millicents, raw);
  }

  /** Ce que la base rend, ou ce qu'un calcul entier a produit. */
  static fromMillicents(millicents: number, shown: string = String(millicents)): ProPriceHt {
    if (!Number.isSafeInteger(millicents) || millicents < 0) {
      throw new InvalidProPriceError(shown, "un montant positif ou nul");
    }
    if (millicents > MAX_PRO_PRICE_MILLICENTS) {
      throw new InvalidProPriceError(shown, "au plus 21 474,83647 €");
    }
    return new ProPriceHt(millicents);
  }
}
