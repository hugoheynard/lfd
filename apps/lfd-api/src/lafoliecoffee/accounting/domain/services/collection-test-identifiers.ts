import { InvalidCollectionTestIdError } from "../errors/collection-test-errors.js";
import { SEPA_IDENTIFIER_MAX, ULID } from "./collection-identifiers.js";
import type { TestSequence } from "./pain008-document.js";

/**
 * **Les références SEPA d'un prélèvement d'essai** (plan
 * `plan-prelevement-d-essai.md`, §4 — format arrêté par vitruve le 2026-10-22).
 *
 * | Champ        | Forme                       | Longueur |
 * | ------------ | --------------------------- | -------- |
 * | `MsgId`      | `ESS-<essai>`               | 30       |
 * | `PmtInfId`   | `ESS-<essai>-<séquence>`    | 35       |
 * | `EndToEndId` | `ESS-<essai>`               | 30       |
 *
 * 🔴 Le préfixe `ESS-` est le SEUL signe d'un essai, et il ne peut pas
 * rencontrer un lot réel : une référence de lot commence par les 26 caractères
 * de son ULID (`collection-identifiers.ts`), sans tiret avant le 27ᵉ — jamais
 * en quatrième position. C'est aussi ce qui rattache un retour bancaire à son
 * essai plutôt qu'à un lot.
 *
 * Un seul débit par fichier : `EndToEndId` n'a pas de rang.
 */

export const TEST_REFERENCE_PREFIX = "ESS-";

export interface TestSepaIdentifiers {
  readonly messageId: string;
  readonly paymentInfoIdOf: (sequence: TestSequence) => string;
  readonly endToEndId: string;
}

/** @throws {InvalidCollectionTestIdError} l'identifiant n'est pas un ULID. */
export function testSepaIdentifiers(testId: string): TestSepaIdentifiers {
  if (!ULID.test(testId)) {
    throw new InvalidCollectionTestIdError(testId);
  }
  const reference = `${TEST_REFERENCE_PREFIX}${testId}`;
  return {
    messageId: bounded(reference),
    paymentInfoIdOf: (sequence) => bounded(`${reference}-${sequence}`),
    endToEndId: bounded(reference),
  };
}

/** Une référence porte-t-elle la marque d'un essai ? */
export function isTestReference(reference: string): boolean {
  return reference.startsWith(TEST_REFERENCE_PREFIX);
}

function bounded(reference: string): string {
  if (reference.length > SEPA_IDENTIFIER_MAX) {
    throw new InvalidCollectionTestIdError(reference);
  }
  return reference;
}
