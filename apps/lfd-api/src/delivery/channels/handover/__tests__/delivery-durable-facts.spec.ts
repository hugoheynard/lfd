import { ShipmentRef } from "../../../../production/channels/delivery/index.js";
import {
  DeliveryOrdersBroughtBackFact,
  DeliveryOrdersBroughtBackPayloadError,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../index.js";

/*
 * Les deux faits durables de la livraison (plan-depart-durable.md, DD1) :
 * leur clé, et leur contrat relu côté abonné. Depuis le reliquat (plan E7,
 * L3a), ils portent des ENVOIS (`shipments`) et relisent l'ancienne forme
 * `orderIds` au rang 1.
 */

// Des instants recopiés, jamais comparés à l'horloge.
const AT = new Date(60_000);

const first = (orderId: string): ShipmentRef => ShipmentRef.firstOf(orderId);

describe("DeliveryRoundDepartedFact", () => {
  it("une clé par tournée : un second passage est une autre tournée", () => {
    const fact = new DeliveryRoundDepartedFact("r_1", "2030-03-12", AT, [
      first("o_1"),
    ]).durableFact();

    expect(fact.key).toBe("delivery.round_departed:r_1");
    expect(fact.type).toBe("delivery.round_departed");
  });

  it("la clé ne change pas avec un reliquat : le rang est dans la charge", () => {
    const fact = new DeliveryRoundDepartedFact("r_1", "2030-03-12", AT, [
      ShipmentRef.of("o_1", 2),
    ]).durableFact();

    expect(fact.key).toBe("delivery.round_departed:r_1");
    expect(fact.payload["shipments"]).toEqual([{ orderId: "o_1", rank: 2 }]);
  });

  it("se relit à l'identique depuis sa charge", () => {
    const fact = new DeliveryRoundDepartedFact("r_1", "2030-03-12", AT, [
      first("o_1"),
      ShipmentRef.of("o_1", 2),
    ]);

    expect(DeliveryRoundDepartedFact.fromPayload(fact.durableFact().payload)).toEqual(fact);
  });

  it("relit un fait écrit avant le reliquat (`orderIds`) au rang 1", () => {
    const fact = DeliveryRoundDepartedFact.fromPayload({
      roundId: "r_1",
      serviceDay: "2030-03-12",
      departedAt: AT.toISOString(),
      orderIds: ["o_1", "o_2"],
    });

    expect(fact.shipments).toEqual([first("o_1"), first("o_2")]);
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
    [
      "envoi de rang 0",
      {
        roundId: "r_1",
        serviceDay: "2030-03-12",
        departedAt: AT.toISOString(),
        shipments: [{ orderId: "o_1", rank: 0 }],
      },
    ],
  ])("refuse une charge %s", (_case, payload) => {
    expect(() => DeliveryRoundDepartedFact.fromPayload(payload)).toThrow(
      DeliveryRoundDepartedPayloadError,
    );
  });
});

describe("DeliveryOrdersBroughtBackFact", () => {
  it("une clé par tournée et par commandes rapportées — au rang 1, celle d'avant", () => {
    const fact = new DeliveryOrdersBroughtBackFact("r_1", [first("o_1")], AT).durableFact();

    expect(fact.key).toBe("delivery.orders_brought_back:r_1:o_1");
  });

  /** Plan E7 reliquat, §4 : une clé oubliée avale le second envoi sans erreur. */
  it("deux rangs de la même commande, deux clés", () => {
    const one = new DeliveryOrdersBroughtBackFact("r_1", [first("o_1")], AT).durableFact();
    const two = new DeliveryOrdersBroughtBackFact(
      "r_1",
      [ShipmentRef.of("o_1", 2)],
      AT,
    ).durableFact();

    expect(two.key).toBe("delivery.orders_brought_back:r_1:o_1:r2");
    expect(two.key).not.toBe(one.key);
  });

  it("se relit à l'identique depuis sa charge", () => {
    const fact = new DeliveryOrdersBroughtBackFact("r_1", [ShipmentRef.of("o_1", 2)], AT);

    expect(DeliveryOrdersBroughtBackFact.fromPayload(fact.durableFact().payload)).toEqual(fact);
  });

  it("relit un fait écrit avant le reliquat (`orderIds`) au rang 1", () => {
    const fact = DeliveryOrdersBroughtBackFact.fromPayload({
      roundId: "r_1",
      orderIds: ["o_1"],
      broughtBackAt: AT.toISOString(),
    });

    expect(fact.shipments).toEqual([first("o_1")]);
  });

  it("refuse une charge sans instant", () => {
    expect(() =>
      DeliveryOrdersBroughtBackFact.fromPayload({ roundId: "r_1", orderIds: ["o_1"] }),
    ).toThrow(DeliveryOrdersBroughtBackPayloadError);
  });
});
