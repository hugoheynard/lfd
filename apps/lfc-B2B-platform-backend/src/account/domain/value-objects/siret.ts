import { InvalidSiretError } from "../errors/account-errors.js";

export const SIRET_LENGTH = 14;

/**
 * SIRET — l'identifiant légal d'un **établissement** français (SIREN sur 9
 * chiffres + NIC sur 5).
 *
 * Stocké **normalisé** (14 chiffres, sans espaces) : les gens le saisissent
 * espacé (`812 456 789 00021`) et un index unique sur la forme brute laisserait
 * passer deux fois le même établissement. L'affichage espacé est une affaire de
 * présentation, pas de stockage.
 *
 * La **clé de Luhn** est vérifiée : c'est ce qui distingue une vraie faute de
 * frappe de 14 chiffres au hasard, sans appeler le moindre service externe.
 */
export class Siret {
  private constructor(readonly value: string) {}

  static create(raw: string): Siret {
    const digits = raw.replace(/\s/gu, "");

    if (!/^\d+$/u.test(digits)) {
      throw new InvalidSiretError(raw, "chiffres uniquement");
    }
    if (digits.length !== SIRET_LENGTH) {
      throw new InvalidSiretError(raw, `${SIRET_LENGTH} chiffres attendus, ${digits.length} reçus`);
    }
    if (!isLuhnValid(digits)) {
      throw new InvalidSiretError(raw, "clé de contrôle invalide (vérifiez la saisie)");
    }

    return new Siret(digits);
  }

  /**
   * Le SIRET **quand on l'a**, `null` quand on ne l'a pas encore.
   *
   * Une société existe avant que ses papiers soient sur la table : un commercial
   * ouvre le compte chez son client, et le SIRET arrivera par e-mail le
   * lendemain. Exiger 14 chiffres à cet instant, c'est renvoyer le commercial
   * dans sa voiture — et le compte ne sera jamais ouvert.
   *
   * Vide vaut donc « pas encore », pas « invalide ». Ce qui EST saisi reste
   * vérifié comme avant : mieux vaut rien qu'un SIRET faux, qu'on croirait bon.
   */
  static createOptional(raw: string): Siret | null {
    return raw.trim() === "" ? null : Siret.create(raw);
  }

  /** Forme lisible par groupes : `812 456 789 00021`. */
  formatted(): string {
    return `${this.value.slice(0, 3)} ${this.value.slice(3, 6)} ${this.value.slice(6, 9)} ${this.value.slice(9)}`;
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
