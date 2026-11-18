import { InvalidCollectionTestIdError } from "../errors/collection-test-errors.js";
import { SEPA_IDENTIFIER_MAX, ULID } from "./collection-identifiers.js";
import type { TestSequence } from "./pain008-document.js";

/**
 * **Les références SEPA d'un envoi d'essai** (plan
 * `plan-essai-a-plusieurs-debiteurs.md`, §1.2).
 *
 * | Champ        | Forme                       | Longueur |
 * | ------------ | --------------------------- | -------- |
 * | `MsgId`      | `ESS-<envoi>`               | 30       |
 * | `PmtInfId`   | `ESS-<envoi>-<séquence>`    | 35       |
 * | `EndToEndId` | `ESS-<essai>`               | 30       |
 *
 * 🔴 Le préfixe `ESS-` est le SEUL signe d'un essai, et il ne peut pas
 * rencontrer un lot réel : une référence de lot commence par les 26 caractères
 * de son ULID (`collection-identifiers.ts`), sans tiret avant le 27ᵉ — jamais
 * en quatrième position. C'est aussi ce qui rattache un retour bancaire à son
 * essai plutôt qu'à un lot.
 *
 * L'`EndToEndId` porte l'ULID de la LIGNE, pas de l'envoi : c'est lui que la
 * banque renvoie dans un retour, et il désigne un débit parmi ceux du fichier.
 */

export const TEST_REFERENCE_PREFIX = "ESS-";

export interface TestFileSepaIdentifiers {
  readonly messageId: string;
  readonly paymentInfoIdOf: (sequence: TestSequence) => string;
}

/** @throws {InvalidCollectionTestIdError} l'identifiant de l'envoi n'est pas un ULID. */
export function testFileSepaIdentifiers(fileId: string): TestFileSepaIdentifiers {
  const reference = referenceOf(fileId);
  return {
    messageId: reference,
    paymentInfoIdOf: (sequence) => bounded(`${reference}-${sequence}`),
  };
}

/** @throws {InvalidCollectionTestIdError} l'identifiant de l'essai n'est pas un ULID. */
export function testEndToEndId(testId: string): string {
  return referenceOf(testId);
}

function referenceOf(id: string): string {
  if (!ULID.test(id)) {
    throw new InvalidCollectionTestIdError(id);
  }
  return bounded(`${TEST_REFERENCE_PREFIX}${id}`);
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
