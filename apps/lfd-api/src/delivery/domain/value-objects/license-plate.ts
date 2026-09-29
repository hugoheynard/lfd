import { InvalidLicensePlateError } from "../errors/delivery-errors.js";

/**
 * Plaque SIV (depuis 2009) : deux lettres, trois chiffres, deux lettres. Le SIV
 * n'emploie ni `I`, ni `O`, ni `U` — trop proches de `1`, `0` et `V`.
 */
const SIV = /^([A-HJ-NP-TV-Z]{2})(\d{3})([A-HJ-NP-TV-Z]{2})$/u;

/**
 * Plaque FNI (avant 2009, encore en circulation) : un à quatre chiffres, une à
 * trois lettres, puis le département — deux chiffres, `2A`/`2B`, ou `971` à
 * `976` outre-mer.
 */
const FNI = /^(\d{1,4})([A-Z]{1,3})(\d{2}|2A|2B|97[1-6])$/u;

/** Tout ce qu'on tape entre les groupes : tiret, espace, point. */
const SEPARATORS = /[\s.\-–]+/gu;

/**
 * **Une plaque d'immatriculation française**, sous sa forme normalisée.
 *
 * `AB-123-CD`, `ab 123 cd` et `AB123CD` sont la même plaque : c'est la forme
 * normalisée que l'index unique compare, donc deux saisies de la même plaque
 * ne passent jamais pour deux véhicules. SIV → `AB-123-CD` ; FNI →
 * `123 ABC 75`, telles qu'elles s'écrivent sur la plaque.
 *
 * ⚠️ **Pas de plaque étrangère.** La flotte est la nôtre, immatriculée en
 * France (décidé au bâti du lot 2, 2026-09-29) : une règle plus large — « de 2
 * à 12 caractères » — laisserait passer une faute de frappe comme une plaque
 * valide, et c'est la faute de frappe qui échappe à l'unicité. Le jour où un
 * véhicule étranger entre dans la flotte, c'est cette classe qu'on élargit.
 */
export class LicensePlate {
  private constructor(readonly value: string) {}

  /** @throws {InvalidLicensePlateError} ni SIV, ni FNI. */
  static of(raw: string): LicensePlate {
    const compact = raw.toUpperCase().replace(SEPARATORS, "");
    const siv = SIV.exec(compact);
    if (siv !== null) {
      return new LicensePlate(`${siv[1]}-${siv[2]}-${siv[3]}`);
    }
    const fni = FNI.exec(compact);
    if (fni !== null) {
      return new LicensePlate(`${fni[1]} ${fni[2]} ${fni[3]}`);
    }
    throw new InvalidLicensePlateError(raw.trim());
  }

  equals(other: LicensePlate): boolean {
    return this.value === other.value;
  }
}
