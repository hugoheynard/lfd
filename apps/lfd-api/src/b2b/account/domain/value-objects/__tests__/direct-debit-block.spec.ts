import { InvalidDirectDebitBlockReasonError } from "../../errors/direct-debit-errors.js";
import { DIRECT_DEBIT_BLOCK_REASON_MAX_LENGTH, DirectDebitBlock } from "../direct-debit-block.js";

// Jamais comparé à l'horloge : relu tel quel.
const AT = new Date("2026-09-25T09:00:00.000Z");

describe("DirectDebitBlock", () => {
  it("pose un blocage avec sa raison nettoyée", () => {
    const block = DirectDebitBlock.impose("  Rejet SEPA  ", AT, "staff_1");

    expect(block).toMatchObject({ blockedAt: AT, blockedBy: "staff_1", reason: "Rejet SEPA" });
  });

  it("refuse une raison vide", () => {
    expect(() => DirectDebitBlock.impose("", AT, "staff_1")).toThrow(
      InvalidDirectDebitBlockReasonError,
    );
  });

  it("accepte la borne, refuse au-delà", () => {
    const atLimit = "a".repeat(DIRECT_DEBIT_BLOCK_REASON_MAX_LENGTH);

    expect(DirectDebitBlock.impose(atLimit, AT, "staff_1").reason).toBe(atLimit);
    expect(() => DirectDebitBlock.impose(`${atLimit}a`, AT, "staff_1")).toThrow(
      InvalidDirectDebitBlockReasonError,
    );
  });

  it("relit un blocage persisté sans le revalider", () => {
    const block = DirectDebitBlock.reconstitute(AT, "staff_1", "Impayé");

    expect(block.reason).toBe("Impayé");
  });
});
