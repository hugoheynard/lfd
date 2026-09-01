import { InvalidRumError } from "../errors/mandate-errors.js";

/** Borne de la norme EPC pour la référence unique de mandat. */
export const RUM_MAX_LENGTH = 35;

/**
 * Le préfixe de nos références. Il n'a aucune valeur technique : il sert à
 * reconnaître une de nos RUM quand un client la dicte au téléphone, ou quand
 * elle apparaît sur le relevé bancaire du débiteur au milieu d'autres.
 */
export const RUM_PREFIX = "LFC";

/**
 * Le jeu de caractères restreint SEPA, tel qu'il s'applique à une référence :
 * lettres non accentuées, chiffres, et une poignée de séparateurs.
 */
const SEPA_RESTRICTED = /^[A-Za-z0-9/\-?:().,'+ ]+$/u;

/**
 * **RUM** — la Référence Unique de Mandat, imprimée sur le papier signé.
 *
 * C'est ce que le débiteur oppose à sa banque, avec l'ICS, pour autoriser ou
 * bloquer un prélèvement. Elle est **frappée par le créancier** — nous — et c'est
 * précisément ce que la sortie de Stripe débloque : la référence venait d'eux et
 * n'existait qu'**après** l'enregistrement, donc un mandat prérempli ne pouvait
 * pas la porter. Sous notre propre ICS, elle existe avant l'impression.
 *
 * **Elle est dérivée de l'identifiant du mandat, et ce n'est pas une commodité.**
 * Une RUM tirée d'un compteur ou d'un aléa serait une seconde numérotation à
 * rendre unique, à verrouiller sous concurrence et à réconcilier ; dérivée d'un
 * ULID déjà unique, sa collision est **impossible par construction** plutôt que
 * surveillée. Le mandat se retrouve aussi depuis sa référence sans table de
 * correspondance — ce qui compte le jour où un client appelle avec, pour seule
 * information, la ligne de son relevé.
 *
 * Immuable : réécrire une RUM invaliderait le papier qui la porte.
 */
export class Rum {
  private constructor(readonly value: string) {}

  /**
   * La référence d'un mandat, dérivée de son identifiant.
   *
   * Un ULID fait 26 caractères de base 32 majuscule ; avec le préfixe, 29 — sous
   * la borne EPC de 35, et sans caractère hors du jeu restreint.
   */
  static forMandate(mandateId: string): Rum {
    const normalized = mandateId.trim().toUpperCase();
    if (normalized === "") {
      throw new InvalidRumError(mandateId, "identifiant de mandat vide");
    }
    return Rum.create(`${RUM_PREFIX}${normalized}`);
  }

  /** Relit une référence existante — base, import, fichier de retour. */
  static create(raw: string): Rum {
    const trimmed = raw.trim();

    if (trimmed === "") {
      throw new InvalidRumError(raw, "vide");
    }
    if (trimmed.length > RUM_MAX_LENGTH) {
      throw new InvalidRumError(
        raw,
        `${RUM_MAX_LENGTH} caractères au maximum, ${trimmed.length} reçus`,
      );
    }
    if (!SEPA_RESTRICTED.test(trimmed)) {
      throw new InvalidRumError(raw, "caractère hors du jeu SEPA (ni accent, ni symbole exotique)");
    }

    return new Rum(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
