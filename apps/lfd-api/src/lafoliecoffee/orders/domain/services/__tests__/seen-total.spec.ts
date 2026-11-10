import { ORDER_TOTAL_CHANGED } from "@lfd/contracts";

import { OrderTotalChangedError } from "../../errors/order-total-changed.error.js";
import { ensureTotalSeen } from "../seen-total.js";

describe("ensureTotalSeen — le total vu est le total facturé (T2)", () => {
  it("un total égal passe, sans rien dire", () => {
    expect(() => ensureTotalSeen(4230, 4230)).not.toThrow();
  });

  it("un centime d'écart refuse, avec les deux totaux et le cas nommé", () => {
    let caught: unknown = null;
    try {
      ensureTotalSeen(4731, 4730);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrderTotalChangedError);
    const refusal = caught as OrderTotalChangedError;
    expect(refusal.category).toBe("business");
    expect(refusal.code).toBe(ORDER_TOTAL_CHANGED);
    expect(refusal.facts).toEqual({ expectedTotalCents: 4730, totalCents: 4731 });
    expect(refusal.totalCents).toBe(4731);
    expect(refusal.message).toContain("47,30");
    expect(refusal.message).toContain("47,31");
  });
});
