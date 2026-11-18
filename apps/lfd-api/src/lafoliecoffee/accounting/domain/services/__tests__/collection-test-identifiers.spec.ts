import { InvalidCollectionTestIdError } from "../../errors/collection-test-errors.js";
import { SEPA_IDENTIFIER_MAX } from "../collection-identifiers.js";
import {
  isTestReference,
  testEndToEndId,
  testFileSepaIdentifiers,
} from "../collection-test-identifiers.js";
import type { TestSequence } from "../pain008-document.js";

const FILE_ID = "01JBQ7Z5K8M3QT9P2X4BE55F00";
const TEST_ID = "01JBQ7Z5K8M3QT9P2X4BE55A00";
const SEQUENCES: readonly TestSequence[] = ["RCUR", "FRST", "OOFF"];

describe("les références SEPA d'un envoi d'essai", () => {
  it("MsgId = ESS-<ULID de l'envoi>, 30 caractères", () => {
    const ids = testFileSepaIdentifiers(FILE_ID);

    expect(ids.messageId).toBe(`ESS-${FILE_ID}`);
    expect(ids.messageId).toHaveLength(30);
  });

  it("EndToEndId = ESS-<ULID de l'essai> : la ligne, pas l'envoi", () => {
    expect(testEndToEndId(TEST_ID)).toBe(`ESS-${TEST_ID}`);
  });

  it.each(SEQUENCES)("PmtInfId = ESS-<envoi>-%s, au plus 35 caractères", (sequence) => {
    const id = testFileSepaIdentifiers(FILE_ID).paymentInfoIdOf(sequence);

    expect(id).toBe(`ESS-${FILE_ID}-${sequence}`);
    expect(id.length).toBeLessThanOrEqual(SEPA_IDENTIFIER_MAX);
  });

  it("la borne SEPA est 35", () => {
    expect(SEPA_IDENTIFIER_MAX).toBe(35);
  });

  it("refuse un identifiant qui n'est pas un ULID", () => {
    expect(() => testFileSepaIdentifiers("pas-un-ulid")).toThrow(InvalidCollectionTestIdError);
    expect(() => testEndToEndId(`${TEST_ID}X`)).toThrow(InvalidCollectionTestIdError);
  });

  it("reconnaît une référence d'essai, jamais une référence de lot", () => {
    expect(isTestReference(`ESS-${TEST_ID}`)).toBe(true);
    expect(isTestReference(`${TEST_ID}-0001`)).toBe(false);
    expect(isTestReference(`${TEST_ID}`)).toBe(false);
  });
});
