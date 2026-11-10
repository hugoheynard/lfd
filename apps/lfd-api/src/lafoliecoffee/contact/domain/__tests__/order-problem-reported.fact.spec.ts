import {
  OrderProblemReportedFact,
  OrderProblemReportedPayloadError,
} from "../order-problem-reported.fact.js";

const fact = new OrderProblemReportedFact(
  "req_1",
  "o1",
  "ORD-0001",
  { companyId: "chalet", name: "Chalet Gentiane", principalCompanyId: "alpes" },
  "u1",
);

describe("OrderProblemReportedFact — le fait « problème signalé »", () => {
  it("se relit à l'identique depuis sa charge", () => {
    expect(OrderProblemReportedFact.fromPayload(fact.durableFact().payload)).toEqual(fact);
  });

  it("une clé par signalement, pas par commande", () => {
    const second = new OrderProblemReportedFact("req_2", "o1", "ORD-0001", fact.site, "u1");
    expect(second.durableFact().key).not.toBe(fact.durableFact().key);
  });

  it("garde un principal nul (commande d'avant la copie)", () => {
    const payload = { ...fact.durableFact().payload, principalCompanyId: null };
    expect(OrderProblemReportedFact.fromPayload(payload).site.principalCompanyId).toBeNull();
  });

  it.each(["requestId", "orderNumber", "siteName", "authorUserId"])(
    "refuse une charge sans %s",
    (field) => {
      const payload = { ...fact.durableFact().payload, [field]: undefined };
      expect(() => OrderProblemReportedFact.fromPayload(payload)).toThrow(
        OrderProblemReportedPayloadError,
      );
    },
  );

  it("refuse un principal qui n'est ni un identifiant ni nul", () => {
    const payload = { ...fact.durableFact().payload, principalCompanyId: 42 };
    expect(() => OrderProblemReportedFact.fromPayload(payload)).toThrow(
      OrderProblemReportedPayloadError,
    );
  });
});
