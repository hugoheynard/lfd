import { InvalidCollectionTestIdError } from "../../errors/collection-test-errors.js";
import { SEPA_IDENTIFIER_MAX } from "../collection-identifiers.js";
import { isTestReference, testSepaIdentifiers } from "../collection-test-identifiers.js";
import type { TestSequence } from "../pain008-document.js";

const TEST_ID = "01JBQ7Z5K8M3QT9P2X4BE55A00";
const SEQUENCES: readonly TestSequence[] = ["RCUR", "FRST", "OOFF"];

describe("les références SEPA d'un essai (format arrêté le 2026-10-22)", () => {
  it("MsgId et EndToEndId = ESS-<ULID>, 30 caractères", () => {
    const ids = testSepaIdentifiers(TEST_ID);

    expect(ids.messageId).toBe(`ESS-${TEST_ID}`);
    expect(ids.endToEndId).toBe(`ESS-${TEST_ID}`);
    expect(ids.messageId).toHaveLength(30);
  });

  it.each(SEQUENCES)("PmtInfId = ESS-<ULID>-%s, au plus 35 caractères", (sequence) => {
    const id = testSepaIdentifiers(TEST_ID).paymentInfoIdOf(sequence);

    expect(id).toBe(`ESS-${TEST_ID}-${sequence}`);
    expect(id.length).toBeLessThanOrEqual(SEPA_IDENTIFIER_MAX);
  });

  it("la borne SEPA est 35", () => {
    expect(SEPA_IDENTIFIER_MAX).toBe(35);
  });

  it("refuse un identifiant qui n'est pas un ULID", () => {
    expect(() => testSepaIdentifiers("pas-un-ulid")).toThrow(InvalidCollectionTestIdError);
    expect(() => testSepaIdentifiers(`${TEST_ID}X`)).toThrow(InvalidCollectionTestIdError);
  });

  it("reconnaît une référence d'essai, jamais une référence de lot", () => {
    expect(isTestReference(`ESS-${TEST_ID}`)).toBe(true);
    expect(isTestReference(`${TEST_ID}-0001`)).toBe(false);
    expect(isTestReference(`${TEST_ID}`)).toBe(false);
  });
});
