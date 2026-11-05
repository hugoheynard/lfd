import { audienceOf } from "../customer-audience.js";
import { pickupAnnouncementOf } from "../pickup-discount-scope.js";

/**
 * Une société suspendue ou en attente est servie comme une active, sauf le
 * crédit (Hugo, 2026-11-03 pour la suspendue, 2026-11-05 pour l'attente —
 * `documentation/comptes-client/plan-pros-en-cours-d-inscription.md` § 0).
 */
describe("audienceOf", () => {
  it.each([
    ["active", "b2b"],
    ["suspended", "b2b"],
    ["pending", "b2b"],
    ["terminated", "b2c"],
    [null, "b2c"],
  ] as const)("%s → %s", (status, audience) => {
    expect(audienceOf(status)).toBe(audience);
  });
});

describe("pickupAnnouncementOf", () => {
  it.each([
    ["active", "b2b"],
    ["suspended", "b2b"],
    ["pending", "b2bPending"],
    ["terminated", "b2c"],
    [null, "b2c"],
  ] as const)("%s → %s", (status, key) => {
    expect(pickupAnnouncementOf(status)).toBe(key);
  });
});
