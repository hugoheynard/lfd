import { scenarioCardPayments } from "../card-payment.purge.js";

describe("scenarioCardPayments", () => {
  it("vise les paiements dont le sujet est une commande du scénario, et eux seuls", () => {
    expect(scenarioCardPayments(["ord_1", "ord_2"])).toEqual({
      subjectType: "order",
      subjectId: { in: ["ord_1", "ord_2"] },
    });
  });
});
