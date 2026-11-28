import { InvalidCounterAccountCeilingError } from "../../errors/counter-account-ceiling-setting.error.js";
import { CounterAccountCeilingSetting } from "../counter-account-ceiling-setting.js";

// Comparée à rien d'autre qu'elle-même : le réglage la recopie.
const AT = new Date("2026-08-07T09:00:00.000Z");

describe("CounterAccountCeilingSetting.pose (§ 3.3)", () => {
  it("garde le montant, l'instant et l'auteur", () => {
    const setting = CounterAccountCeilingSetting.pose(50_000, AT, "staff_lea");

    expect(setting).toMatchObject({
      ceilingCents: 50_000,
      updatedAt: AT,
      updatedByStaffId: "staff_lea",
    });
  });

  it("admet zéro, et `null` pour aucun plafond", () => {
    expect(CounterAccountCeilingSetting.pose(0, AT, "s").ceilingCents).toBe(0);
    expect(CounterAccountCeilingSetting.pose(null, AT, "s").ceilingCents).toBeNull();
  });

  it.each([-1, 12.5, Number.MAX_SAFE_INTEGER + 1])("refuse %p", (cents) => {
    expect(() => CounterAccountCeilingSetting.pose(cents, AT, "s")).toThrow(
      InvalidCounterAccountCeilingError,
    );
  });
});
