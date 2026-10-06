import {
  DeliveryOrdersBroughtBackFact,
  DeliveryOrdersBroughtBackPayloadError,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../index.js";

/*
 * Les deux faits durables de la livraison (plan-depart-durable.md, DD1) :
 * leur clé, et leur contrat relu côté abonné.
 */

// Des instants recopiés, jamais comparés à l'horloge.
const AT = new Date(60_000);

describe("DeliveryRoundDepartedFact", () => {
  it("une clé par tournée : un second passage est une autre tournée", () => {
    const fact = new DeliveryRoundDepartedFact("r_1", "2030-03-12", AT, ["o_1"]).durableFact();

    expect(fact.key).toBe("delivery.round_departed:r_1");
    expect(fact.type).toBe("delivery.round_departed");
  });

  it("se relit à l'identique depuis sa charge", () => {
    const fact = new DeliveryRoundDepartedFact("r_1", "2030-03-12", AT, ["o_1", "o_2"]);

    expect(DeliveryRoundDepartedFact.fromPayload(fact.durableFact().payload)).toEqual(fact);
  });

  it.each([
    ["sans tournée", { serviceDay: "2030-03-12", departedAt: AT.toISOString(), orderIds: [] }],
    [
      "instant illisible",
      { roundId: "r_1", serviceDay: "2030-03-12", departedAt: "x", orderIds: [] },
    ],
    [
      "commandes hors forme",
      { roundId: "r_1", serviceDay: "2030-03-12", departedAt: AT.toISOString(), orderIds: [1] },
    ],
  ])("refuse une charge %s", (_case, payload) => {
    expect(() => DeliveryRoundDepartedFact.fromPayload(payload)).toThrow(
      DeliveryRoundDepartedPayloadError,
    );
  });
});

describe("DeliveryOrdersBroughtBackFact", () => {
  it("une clé par tournée et par commandes rapportées", () => {
    const fact = new DeliveryOrdersBroughtBackFact("r_1", ["o_1"], AT).durableFact();

    expect(fact.key).toBe("delivery.orders_brought_back:r_1:o_1");
  });

  it("se relit à l'identique depuis sa charge", () => {
    const fact = new DeliveryOrdersBroughtBackFact("r_1", ["o_1"], AT);

    expect(DeliveryOrdersBroughtBackFact.fromPayload(fact.durableFact().payload)).toEqual(fact);
  });

  it("refuse une charge sans instant", () => {
    expect(() =>
      DeliveryOrdersBroughtBackFact.fromPayload({ roundId: "r_1", orderIds: ["o_1"] }),
    ).toThrow(DeliveryOrdersBroughtBackPayloadError);
  });
});
