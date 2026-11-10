import { InvalidLegalAddressError } from "../errors/accounting-errors.js";

/** Ce qu'une adresse porte, avant d'être validée. */
export interface LegalAddressInput {
  readonly line1: string;
  readonly line2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
}

/**
 * L'adresse du **siège** d'une entité juridique.
 *
 * Séparée du modèle `Address` du commerce, qui décrit une livraison ou une
 * facturation client : celle-ci n'a ni créneau, ni instructions, ni destinataire.
 * Elle a en revanche une contrainte que l'autre n'a pas — elle s'imprime sur un
 * mandat et sur une facture, donc elle doit tenir en lignes lisibles et ne jamais
 * être vide.
 *
 * Elle est **copiée** dans les snapshots plutôt que référencée : un déménagement
 * ne réécrit pas les mandats déjà signés.
 */
export class LegalAddress {
  private constructor(
    readonly line1: string,
    readonly line2: string,
    readonly postalCode: string,
    readonly city: string,
    readonly countryCode: string,
  ) {}

  static create(input: LegalAddressInput): LegalAddress {
    const line1 = required(input.line1, "Adresse");
    const postalCode = required(input.postalCode, "Code postal");
    const city = required(input.city, "Ville");
    const countryCode = input.countryCode.trim().toUpperCase();

    if (!/^[A-Z]{2}$/u.test(countryCode)) {
      throw new InvalidLegalAddressError("Pays", "code ISO à deux lettres attendu (ex. FR)");
    }

    return new LegalAddress(line1, input.line2.trim(), postalCode, city, countryCode);
  }

  /** Les lignes non vides, dans l'ordre où elles s'impriment. */
  lines(): readonly string[] {
    return [this.line1, this.line2, `${this.postalCode} ${this.city}`, this.countryCode].filter(
      (line) => line !== "",
    );
  }

  toString(): string {
    return this.lines().join(", ");
  }
}

function required(raw: string, field: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new InvalidLegalAddressError(field, "obligatoire sur un document opposable");
  }
  return trimmed;
}
