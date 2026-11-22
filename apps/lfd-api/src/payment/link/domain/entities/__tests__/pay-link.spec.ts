import { PayLink, PAY_LINK_TEXT_MAX_LENGTH, type PayLinkOpening } from "../pay-link.js";
import { InvalidPayLinkError, PayLinkAlreadyRevokedError } from "../../errors/pay-link-errors.js";

const OPENED_AT = new Date(0);
const REVOKED_AT = new Date(60_000);

function opening(overrides: Partial<PayLinkOpening> = {}): PayLinkOpening {
  return {
    id: "pl_1",
    subjectType: "free_charge",
    subjectId: "fc_1",
    origin: "lafoliecoffee",
    payerLabel: "  Café des Arts  ",
    tokenHash: "hash",
    tokenSealed: "sealed",
    at: OPENED_AT,
    by: "staff_1",
    ...overrides,
  };
}

describe("PayLink", () => {
  it("naît vivant, payeur et auteur rognés", () => {
    const link = PayLink.open(opening());
    expect(link.isLive).toBe(true);
    expect(link.toPersistence()).toMatchObject({
      payerLabel: "Café des Arts",
      createdBy: "staff_1",
      revokedAt: null,
      revokedReason: null,
    });
  });

  it.each([
    ["un type de sujet mal formé", { subjectType: "Order" }],
    ["un sujet sans identifiant", { subjectId: " " }],
    ["un payeur vide", { payerLabel: "   " }],
    ["un auteur vide", { by: "" }],
    ["une origine vide", { origin: "" }],
    ["un payeur trop long", { payerLabel: "x".repeat(PAY_LINK_TEXT_MAX_LENGTH + 1) }],
    ["une empreinte vide", { tokenHash: "" }],
  ])("refuse %s", (_label, overrides) => {
    expect(() => PayLink.open(opening(overrides))).toThrow(InvalidPayLinkError);
  });

  it("se révoque une fois, instant et motif posés ensemble", () => {
    const link = PayLink.open(opening());
    link.revoke(" sujet réglé ", REVOKED_AT);
    expect(link.isLive).toBe(false);
    expect(link.toPersistence()).toMatchObject({
      revokedAt: REVOKED_AT,
      revokedReason: "sujet réglé",
    });
  });

  it("ne se re-révoque pas", () => {
    const link = PayLink.open(opening());
    link.revoke("réglé", REVOKED_AT);
    expect(() => link.revoke("encore", REVOKED_AT)).toThrow(PayLinkAlreadyRevokedError);
  });

  it("refuse une révocation sans motif, et reste vivant", () => {
    const link = PayLink.open(opening());
    expect(() => link.revoke("  ", REVOKED_AT)).toThrow(InvalidPayLinkError);
    expect(link.isLive).toBe(true);
  });

  it("se relit tel qu'il a été écrit", () => {
    const link = PayLink.open(opening());
    link.revoke("annulé", REVOKED_AT);
    const row = link.toPersistence();
    expect(PayLink.rehydrate(row).toPersistence()).toEqual(row);
  });
});
