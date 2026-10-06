import { GetDeliveryRunSheetQuery } from "../get-delivery-run-sheet.query.js";
import { DAY, FixedRoundPlacements, PLACED_AT, entry, handlerOf } from "./run-sheet-doubles.js";

/**
 * La feuille de route : la rencontre des trois lectures, l'état partagé avec
 * la file du comptoir, et « trois questions, jamais N + 1 ». Les doublés
 * héritent du port abstrait et enregistrent leurs appels.
 */

describe("GetDeliveryRunSheetHandler", () => {
  it("rend chaque arrêt avec ses consignes, sa procédure et ses dates en ISO", async () => {
    const { handler } = handlerOf([entry()]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(view.day).toBe(DAY);
    expect(view.stops[0]).toMatchObject({
      orderId: "ord_1",
      signatureRequired: true,
      orderNote: "par la cour",
      state: "expected",
      withoutAtelierSheet: false,
      readyAt: null,
      placedAt: PLACED_AT.toISOString(),
      addressBook: {
        note: "sonner deux fois",
        gps: { lat: 45.44, lng: 6.98 },
        stopMinutes: 25,
        procedure: [
          {
            id: "step_1",
            title: "Portail",
            body: "code 1234",
            hasPhoto: true,
            photoRevision: "01JREV",
          },
        ],
      },
    });
  });

  it("tait le temps de livraison sur place quand l'adresse suit le réglage (L7b-C4)", async () => {
    const book = entry().addressBook;
    const { handler } = handlerOf([
      entry({ addressBook: book === null ? null : { ...book, stopMinutes: null } }),
    ]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(view.stops[0]?.addressBook).not.toHaveProperty("stopMinutes");
  });

  it("🔴 ne sert AUCUN champ monétaire", async () => {
    const { handler } = handlerOf([entry()]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    const keys = Object.keys(view.stops[0] ?? {});
    expect(keys.filter((key) => /cents|price|total(?!Units)|amount/iu.test(key))).toEqual([]);
  });

  it("garde `addressBook: null` quand la commande n'est pas reliée au carnet", async () => {
    const { handler } = handlerOf([entry({ addressBook: null })]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(view.stops[0]?.addressBook).toBeNull();
  });

  it("dit l'état comme la file du comptoir : attestée et annulée reste `handed_over`", async () => {
    const { handler } = handlerOf(
      [entry({ status: "cancelled" })],
      new Map([
        ["ord_1", { handedOverAt: PLACED_AT, handedOverBy: "staff-1", via: "manual" as const }],
      ]),
    );

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(view.stops[0]?.state).toBe("handed_over");
  });

  it("🔴 signale la retardataire sans feuille d'atelier, et elle seule", async () => {
    const { handler } = handlerOf(
      [entry({ orderId: "ord_1" }), entry({ orderId: "ord_late" })],
      new Map(),
      new Set(["ord_late"]),
    );

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(view.stops.map((stop) => [stop.orderId, stop.withoutAtelierSheet])).toEqual([
      ["ord_1", false],
      ["ord_late", true],
    ]);
  });

  it("pose trois questions pour tout le lot, jamais une par commande", async () => {
    const { handler, sheet, attestations, sheets } = handlerOf([
      entry({ orderId: "a" }),
      entry({ orderId: "b" }),
    ]);

    await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

    expect(sheet.calls).toEqual([DAY]);
    expect(attestations.calls).toEqual([["a", "b"]]);
    expect(sheets.calls).toEqual([{ day: DAY, orderIds: ["a", "b"] }]);
  });

  it("🔴 sans `delivery_procedures:read`, la procédure part vide et le reste du carnet demeure (DG-D8)", async () => {
    const { handler } = handlerOf([entry()]);

    const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, false));

    expect(view.stops[0]?.addressBook).toMatchObject({
      note: "sonner deux fois",
      gps: { lat: 45.44, lng: 6.98 },
      stopMinutes: 25,
      procedure: [],
    });
    expect(JSON.stringify(view)).not.toMatch(/code 1234|Portail|01JREV/u);
  });

  describe("les livraisons d'un autre jour nommées par l'écran (rapportées, § 4)", () => {
    it("ajoute la rapportée replacée, avec son adresse, sa fenêtre et sa procédure, après celles du jour", async () => {
      const { handler } = handlerOf([entry({ orderId: "a" })], new Map(), new Set(), [
        entry({ orderId: "back", reference: "ORD-BACK" }),
      ]);

      const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true, ["back"]));

      expect(view.stops.map((stop) => stop.orderId)).toEqual(["a", "back"]);
      expect(view.stops[1]).toMatchObject({
        address: { ligne1: "12 rue du Test" },
        window: { start: "08:00", end: "09:00" },
        addressBook: { procedure: [{ title: "Portail" }] },
        withoutAtelierSheet: false,
      });
    });

    it("🔴 sans `delivery_procedures:read`, sa procédure part vide aussi (DG-D8)", async () => {
      const { handler } = handlerOf([], new Map(), new Set(), [entry({ orderId: "back" })]);

      const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, false, ["back"]));

      expect(view.stops[0]?.addressBook?.procedure).toEqual([]);
    });

    it("ne double pas une commande déjà du jour, et ne la cherche pas au plan d'atelier d'un autre jour", async () => {
      const { handler, sheets, attestations } = handlerOf(
        [entry({ orderId: "a" })],
        new Map(),
        new Set(),
        [entry({ orderId: "back" })],
      );

      const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true, ["a", "back"]));

      expect(view.stops.map((stop) => stop.orderId)).toEqual(["a", "back"]);
      expect(attestations.calls).toEqual([["a", "back"]]);
      expect(sheets.calls).toEqual([{ day: DAY, orderIds: ["a"] }]);
    });
  });

  describe("la tournée et le rang de chaque arrêt (2026-10-06)", () => {
    it("dit la tournée et le rang d'une placée, `null` pour une non placée, et le compte du jour", async () => {
      const rounds = new FixedRoundPlacements(
        new Map([["a", { roundId: "rnd_1", label: "Kangoo blanc · passage 2", position: 2 }]]),
        3,
      );
      const { handler } = handlerOf(
        [entry({ orderId: "a" }), entry({ orderId: "b" })],
        new Map(),
        new Set(),
        [],
        rounds,
      );

      const view = await handler.execute(new GetDeliveryRunSheetQuery(DAY, true));

      expect(view.roundCount).toBe(3);
      expect(view.stops[0]?.round).toEqual({
        roundId: "rnd_1",
        label: "Kangoo blanc · passage 2",
        position: 2,
      });
      expect(view.stops[1]?.round).toBeNull();
    });

    it("demande les places une fois pour tout le lot, rapportées comprises", async () => {
      const { handler, rounds } = handlerOf([entry({ orderId: "a" })], new Map(), new Set(), [
        entry({ orderId: "back" }),
      ]);

      await handler.execute(new GetDeliveryRunSheetQuery(DAY, true, ["back"]));

      expect(rounds.calls).toEqual([{ day: DAY, orderIds: ["a", "back"] }]);
    });
  });
});
