import type { OrderDeparture } from "../../../channels/delivery/index.js";
import type { PackingBoardDay } from "../../../domain/ports/packing-board.reader.js";
import { GetPackingBoardQuery } from "../get-packing-board.query.js";
import { boardAround, order, parisAt } from "./packing-board-doubles.js";

// Un jour comparé aux instants de la fixture, jamais au mur.
const DAY = "2030-03-12";

function setup(day: PackingBoardDay, known: readonly OrderDeparture[] = []) {
  return boardAround(day, { known });
}

describe("GetPackingBoardHandler — le poste lu au colisage (K3a)", () => {
  it("compose ses tables avec la retenue et la destination du fournil, et les auteurs du staff", async () => {
    const { handler, held, authors } = setup({
      orders: [order("1", "staff_1"), order("2", null)],
      withdrawn: [],
      stocks: [],
    });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(held.asked).toEqual([["1", "2"]]);
    expect(authors.asked).toEqual([["staff_1", null]]);
    expect(
      view.sheets.map((sheet) => [sheet.orderId, sheet.destination, sheet.qualityHeld]),
    ).toEqual([
      ["1", "12 rue du Four", false],
      ["2", "", true],
    ]);
    expect(view.sheets[0]?.packedByName).toBe("Marie Boulanger");
  });

  it("une journée vide ne demande pas la destination au fournil", async () => {
    const { handler, destinations } = setup({ orders: [], withdrawn: [], stocks: [] });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(view.closedAt).toBeNull();
    expect(destinations.asked).toEqual([]);
  });

  it("range par heure « prête pour » : le départ de la tournée, du transfert, puis le créneau", async () => {
    const delivery = {
      ...order("1", null),
      fulfillmentMethod: "delivery" as const,
      dueAt: "11:00",
    };
    const onSite = { ...order("2", null), dueAt: "06:45" };
    const viaTransfer = { ...order("3", null), dueAt: "09:00" };
    const notComposed = {
      ...order("4", null),
      fulfillmentMethod: "delivery" as const,
      dueAt: "05:00",
    };
    const { handler, departures } = setup(
      { orders: [delivery, onSite, viaTransfer, notComposed], withdrawn: [], stocks: [] },
      [
        { orderId: "1", at: parisAt(DAY, "07:10"), via: "delivery", departed: false },
        { orderId: "3", at: parisAt(DAY, "06:30"), via: "transfer", departed: false },
      ],
    );

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(departures.asked).toEqual([["1", "2", "3", "4"]]);
    expect(view.sheets.map((sheet) => [sheet.orderId, sheet.readyBy, sheet.readyBySource])).toEqual(
      [
        ["3", "06:30", "transfer"],
        ["2", "06:45", "due"],
        // La fenêtre du client (11:00) ne compte pas : c'est la tournée qui part.
        ["1", "07:10", "round"],
        // Pas encore de tournée : pas d'heure, en dernier — jamais sa fenêtre.
        ["4", null, null],
      ],
    );
  });

  it("dit le reste abandonné d'un départ décidé, et où en est l'impression de son BL", async () => {
    const { handler, reprints, aftermath } = setup({
      orders: [order("1", null), order("2", null), order("3", null), order("4", null)],
      withdrawn: [],
      stocks: [],
    });
    aftermath.decided.push({
      orderId: "1",
      rank: 1,
      abandoned: [{ sku: "PAI", productName: "Baguette", quantity: 2, saleUnit: "piece" as const }],
      deliveryNote: "to_print",
      decision: null,
    });
    aftermath.decided.push({
      orderId: "2",
      rank: 1,
      abandoned: [],
      deliveryNote: "printed",
      decision: null,
    });
    // Changé depuis son impression, sans décision : à réimprimer aussi.
    reprints.needed.add("3");

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(
      view.sheets.map((sheet) => [
        sheet.orderId,
        sheet.deliveryNotePrint,
        sheet.abandonedRemainder,
      ]),
    ).toEqual([
      [
        "1",
        "to_reprint",
        [{ sku: "PAI", productName: "Baguette", quantity: 2, saleUnit: "piece" as const }],
      ],
      ["2", "reprinted", []],
      ["3", "to_reprint", []],
      ["4", null, []],
    ]);
  });

  it("dit la décision prise, son auteur nommé par l'annuaire, en une seule lecture", async () => {
    const { handler, aftermath, authors } = setup({
      orders: [order("1", null), order("2", null)],
      withdrawn: [],
      stocks: [],
    });
    const decidedAt = new Date(5_000);
    aftermath.decided.push({
      orderId: "1",
      rank: 1,
      abandoned: [],
      deliveryNote: "printed",
      decision: { remainder: "abandoned", decidedAt, decidedBy: "staff_1" },
    });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    expect(view.sheets.map((sheet) => [sheet.orderId, sheet.shortfallDecision])).toEqual([
      [
        "1",
        {
          remainder: "abandoned",
          decidedAt: decidedAt.toISOString(),
          decidedBy: "staff_1",
          decidedByName: "Marie Boulanger",
        },
      ],
      ["2", null],
    ]);
    expect(authors.asked).toEqual([[null, null, "staff_1"]]);
  });

  /**
   * Plan E7 reliquat, LB : deux fiches d'une commande, une par envoi. La
   * décision du reliquat est la sienne, et la fiche du rang 1 n'en dit rien.
   */
  it("dit la décision d'un reliquat sur SA fiche, jamais sur celle du rang 1", async () => {
    const { handler, aftermath } = setup({
      orders: [order("1", null), { ...order("1", null), rank: 2 }],
      withdrawn: [],
      stocks: [],
    });
    aftermath.decided.push({
      orderId: "1",
      rank: 2,
      abandoned: [
        { sku: "CRO", productName: "Croissant", quantity: 1, saleUnit: "piece" as const },
      ],
      deliveryNote: "to_print",
      decision: null,
    });

    const view = await handler.execute(new GetPackingBoardQuery(DAY));

    // La vue ne porte pas le rang : les deux fiches se distinguent par ce qu'elles disent.
    const said = view.sheets.map((sheet) => [sheet.deliveryNotePrint, sheet.abandonedRemainder]);
    expect(said).toHaveLength(2);
    expect(said).toEqual(
      expect.arrayContaining([
        [null, []],
        [
          "to_reprint",
          [{ sku: "CRO", productName: "Croissant", quantity: 1, saleUnit: "piece" as const }],
        ],
      ]),
    );
  });
});
