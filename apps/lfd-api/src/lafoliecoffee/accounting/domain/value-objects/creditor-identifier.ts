import { InvalidCreditorIdentifierError } from "../errors/accounting-errors.js";

/** `FR` + 2 chiffres de clé + 3 de code activité + 1 au moins d'identifiant. */
export const ICS_MIN_LENGTH = 8;
/** Borne haute de la norme EPC pour l'identifiant créancier. */
export const ICS_MAX_LENGTH = 35;
/** L'ICS français est de longueur fixe : `FR` + `72` + `ZZZ` + 6 caractères. */
export const ICS_FRENCH_LENGTH = 13;

/**
 * **ICS** — l'Identifiant Créancier SEPA, ce qui nous désigne comme émetteur.
 *
 * Il est attribué par la Banque de France via la banque, et il est **imprimé sur
 * chaque mandat signé** : c'est lui que le débiteur oppose à sa banque pour
 * autoriser — ou bloquer — nos prélèvements. Quatre zones :
 *
 * ```
 * FR 72 ZZZ 123456
 * │  │  │   └── identifiant national attribué au créancier
 * │  │  └────── code activité, libre, segmente les collectes d'un même créancier
 * │  └───────── clé de contrôle
 * └──────────── pays
 * ```
 *
 * ⚠️ **La clé de contrôle n'est PAS vérifiée ici, et c'est délibéré.** Son calcul
 * exclut le code activité et se fait sur une chaîne recomposée ; nous n'avons
 * aujourd'hui **aucun ICS réel** contre lequel éprouver l'implémentation. Un
 * contrôle non testé qui rejetterait le véritable ICS le jour de sa saisie
 * finirait désactivé sous la pression — c'est le pire des deux mondes. La forme,
 * elle, attrape déjà l'erreur réaliste : un SIRET collé dans le champ ICS.
 *
 * À rebrancher le jour où le DAF fournit l'ICS : le test qui manque est
 * « l'ICS de production est accepté ».
 */
export class CreditorIdentifier {
  private constructor(readonly value: string) {}

  static create(raw: string): CreditorIdentifier {
    const normalized = raw.replace(/[\s-]/gu, "").toUpperCase();

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]+$/u.test(normalized)) {
      throw new InvalidCreditorIdentifierError(
        raw,
        "attendu : deux lettres de pays, deux chiffres de clé, trois de code activité, puis l'identifiant",
      );
    }
    if (normalized.length < ICS_MIN_LENGTH || normalized.length > ICS_MAX_LENGTH) {
      throw new InvalidCreditorIdentifierError(
        raw,
        `longueur hors bornes (${normalized.length} caractères, attendu ${ICS_MIN_LENGTH} à ${ICS_MAX_LENGTH})`,
      );
    }
    if (normalized.startsWith("FR") && normalized.length !== ICS_FRENCH_LENGTH) {
      throw new InvalidCreditorIdentifierError(
        raw,
        `un ICS français fait ${ICS_FRENCH_LENGTH} caractères, celui-ci en fait ${normalized.length}`,
      );
    }

    return new CreditorIdentifier(normalized);
  }

  countryCode(): string {
    return this.value.slice(0, 2);
  }

  /**
   * Le code activité (positions 5 à 7). Libre au créancier : il permet de
   * séparer plusieurs flux sous un même identifiant national, et `ZZZ` est la
   * valeur par défaut quand on n'en sépare aucun.
   */
  businessCode(): string {
    return this.value.slice(4, 7);
  }

  /** L'identifiant national, sans le pays, la clé ni le code activité. */
  nationalIdentifier(): string {
    return this.value.slice(7);
  }

  toString(): string {
    return this.value;
  }
}
