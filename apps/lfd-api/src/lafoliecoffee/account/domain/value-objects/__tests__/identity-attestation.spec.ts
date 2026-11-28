import { InvalidOpeningAuthorError } from "../../errors/account-errors.js";
import { IdentityAttestation } from "../identity-attestation.js";

const AT = new Date("2026-08-07T09:00:00.000Z");

describe("IdentityAttestation — la case « J'ai vu une preuve d'identité »", () => {
  it("garde la case, l'agent et l'instant, et rien d'autre", () => {
    expect(IdentityAttestation.attest(true, " staff_1 ", AT).toRecord()).toEqual({
      identitySeen: true,
      attestedByStaffId: "staff_1",
      attestedAt: AT,
    });
  });

  it("n'est pas bloquante : une case non cochée est une trace comme une autre", () => {
    expect(IdentityAttestation.attest(false, "staff_1", AT).identitySeen).toBe(false);
  });

  it("refuse une attestation sans agent", () => {
    expect(() => IdentityAttestation.attest(true, "  ", AT)).toThrow(InvalidOpeningAuthorError);
  });
});
