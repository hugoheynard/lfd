import { DuplicateSubjectSettlementError } from "../../../domain/errors/card-payment-errors.js";
import {
  TestSubjectSettlement,
  Timeline,
} from "../../../application/__tests__/card-payment-doubles.js";
import { RegisteredSubjectSettlements } from "../index.js";

describe("RegisteredSubjectSettlements", () => {
  it("range un implémenteur par type", () => {
    const order = new TestSubjectSettlement(new Timeline(), "order");
    const proposal = new TestSubjectSettlement(new Timeline(), "revision_proposal");
    const settlements = new RegisteredSubjectSettlements([order, proposal]);

    expect(settlements.forType("order")).toBe(order);
    expect(settlements.forType("invoice")).toBeNull();
    expect(settlements.all()).toEqual([order, proposal]);
  });

  it("refuse deux implémenteurs pour un même type", () => {
    expect(
      () =>
        new RegisteredSubjectSettlements([
          new TestSubjectSettlement(new Timeline(), "order"),
          new TestSubjectSettlement(new Timeline(), "order"),
        ]),
    ).toThrow(DuplicateSubjectSettlementError);
  });
});
