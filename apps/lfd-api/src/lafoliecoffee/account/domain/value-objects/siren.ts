import { InvalidSirenError } from "../errors/account-errors.js";
import { isLuhnValid } from "./luhn.js";
import type { Siret } from "./siret.js";

export const SIREN_LENGTH = 9;

/**
 * SIREN — l'identifiant légal d'une **entreprise** (9 chiffres), là où le SIRET
 * identifie l'un de ses établissements.
 *
 * C'est une mention obligatoire du mandat interentreprises : le débiteur est la
 * personne morale, pas le local. Stocké **normalisé**, sans espaces.
 *
 * Distinct du `Siren` d'`accounting` (l'entité émettrice), et c'est voulu : deux
 * contextes, deux langages. Le partager ferait traverser une frontière pour une
 * classe de quinze lignes.
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
    // Luhn laisse passer `000000000` : la somme est nulle. C'est le remplissage
    // qu'on tape pour « avancer » sur une fiche, et il sortirait imprimé.
    if (/^0+$/u.test(digits)) {
      throw new InvalidSirenError(raw, "aucun SIREN n'est composé de zéros");
    }

    return new Siren(digits);
  }

  /** Le SIREN **quand on l'a**, `null` sinon — vide vaut « pas encore ». */
  static createOptional(raw: string): Siren | null {
    return raw.trim() === "" ? null : Siren.create(raw);
  }

  /**
   * Le SIREN que porte un SIRET, ou `null` si ses neuf premiers chiffres n'en
   * sont pas un.
   *
   * 🔴 La clé de Luhn d'un SIRET (14 chiffres) ne garantit PAS celle de son
   * préfixe : `81245678900021` est un SIRET valide dont le préfixe `812456789`
   * n'est pas un SIREN valide. En déduire un SIREN sans le revérifier écrirait
   * une valeur que ce value object refuse au chargement suivant.
   */
  static prefixOf(siret: Siret): Siren | null {
    try {
      return Siren.create(siret.value.slice(0, SIREN_LENGTH));
    } catch (error) {
      if (error instanceof InvalidSirenError) {
        return null;
      }
      throw error;
    }
  }

  /** Forme lisible par groupes : `812 456 788`. */
  formatted(): string {
    return `${this.value.slice(0, 3)} ${this.value.slice(3, 6)} ${this.value.slice(6)}`;
  }

  equals(other: Siren): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
