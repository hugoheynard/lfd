/**
 * **Un SIRET et un numéro de TVA fictifs mais VALIDES**, dérivés d'un rang.
 *
 * Les maisons des tournées de demain sont une vingtaine : écrire et recalculer
 * leurs clés à la main, comme pour les onze de `delivery-clients.seed.ts`,
 * coûtait une erreur par ligne. Ici les clés se calculent — Luhn sur le SIREN
 * (la société le recalcule à partir du SIRET), Luhn sur le SIRET, et la clé
 * TVA `(12 + 3 × (SIREN mod 97)) mod 97`.
 *
 * Le préfixe `93` n'est attribué à aucune des maisons déjà semées (vérifié le
 * 2026-10-06 : elles sont en `90…` et `91…`) ; deux rangs distincts donnent
 * deux SIREN distincts.
 */

/** Le préfixe des SIREN fabriqués ici. */
const SIREN_PREFIX = "93";
/** Les chiffres du rang dans le SIREN : 9 = préfixe (2) + rang (6) + clé (1). */
const RANK_DIGITS = 6;
/** L'établissement : le siège, `0001`, puis sa clé. */
const NIC_STEM = "0001";
const VAT_MODULUS = 97;
const VAT_OFFSET = 12;
const VAT_FACTOR = 3;
const LUHN_BASE = 10;

/** Le chiffre qui rend `stem + chiffre` valide au sens de Luhn. */
export function luhnCheckDigit(stem: string): string {
  let sum = 0;
  for (let i = 0; i < stem.length; i++) {
    const digit = Number(stem[stem.length - 1 - i]);
    // La clé occupera le rang 0 depuis la droite : le dernier chiffre du
    // radical est donc au rang 1, celui qu'on double.
    const doubled = i % 2 === 0 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return String((LUHN_BASE - (sum % LUHN_BASE)) % LUHN_BASE);
}

/** L'immatriculation fictive du rang donné (0 et plus). */
export function fictiveRegistration(rank: number): {
  readonly siret: string;
  readonly vatNumber: string;
} {
  const stem = `${SIREN_PREFIX}${String(rank + 1).padStart(RANK_DIGITS, "0")}`;
  const siren = `${stem}${luhnCheckDigit(stem)}`;
  const siretStem = `${siren}${NIC_STEM}`;
  const siret = `${siretStem}${luhnCheckDigit(siretStem)}`;
  const key = (VAT_OFFSET + VAT_FACTOR * (Number(siren) % VAT_MODULUS)) % VAT_MODULUS;
  return { siret, vatNumber: `FR${String(key).padStart(2, "0")}${siren}` };
}
