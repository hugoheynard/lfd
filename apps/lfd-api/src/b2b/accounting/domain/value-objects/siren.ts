import { InvalidSirenError } from "../errors/accounting-errors.js";

export const SIREN_LENGTH = 9;

/**
 * SIREN — l'identifiant légal d'une **entreprise** (9 chiffres), là où le SIRET
 * identifie un établissement.
 *
 * C'est le SIREN qui figure sur une facture et sur un mandat, parce que c'est la
 * personne morale qui encaisse, pas le local où elle travaille.
 *
 * Stocké **normalisé**, sans espaces : la saisie humaine est groupée
 * (`812 456 789`) et deux formes de la même entreprise déjoueraient tout index
 * unique. La clé de Luhn est vérifiée — c'est ce qui distingue une faute de
 * frappe de neuf chiffres au hasard, sans appeler de service externe.
 *
 * L'algorithme de Luhn est **recopié** de `account/domain/value-objects/siret.ts`
 * plutôt que partagé : il y est privé au module, et exposer un utilitaire
 * traversant deux contextes pour douze lignes d'arithmétique coûterait plus cher
 * que la duplication.
 */
export class Siren {
  private constructor(readonly value: string) {}

  static create(raw: string): Siren {
    const digits = raw.replace(/\s/gu, "");

    if (!/^\d+$/u.test(digits)) {
      throw new InvalidSirenError(raw, "chiffres uniquement");
    }
    if (digits.length !== SIREN_LENGTH) {
      throw new InvalidSirenError(raw, `${SIREN_LENGTH} chiffres attendus, ${digits.length} reçus`);
    }
    if (!isLuhnValid(digits)) {
      throw new InvalidSirenError(raw, "clé de contrôle invalide (vérifiez la saisie)");
    }
    // Luhn laisse passer `000000000` : la somme est nulle, donc multiple de 10.
    // C'est le remplissage que quelqu'un tape pour « avancer » sur une fiche —
    // et il ressortirait imprimé sur une facture, en toutes lettres.
    if (/^0+$/u.test(digits)) {
      throw new InvalidSirenError(raw, "aucun SIREN n'est composé de zéros");
    }

    return new Siren(digits);
  }

  /** Forme lisible par groupes : `812 456 789`. */
  formatted(): string {
    return `${this.value.slice(0, 3)} ${this.value.slice(3, 6)} ${this.value.slice(6)}`;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Clé de Luhn, calculée de droite à gauche : un chiffre sur deux est doublé, et
 * un doublement au-delà de 9 se réduit en lui retirant 9. La somme doit être un
 * multiple de 10.
 */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    // `digits` est déjà prouvé numérique et l'index est dans les bornes.
    const digit = Number(digits[fromRight]);
    const doubled = i % 2 === 1 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
}
