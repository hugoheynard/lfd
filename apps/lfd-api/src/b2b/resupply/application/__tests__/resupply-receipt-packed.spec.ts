import { CorrectReceivedResupplyLineCommand } from "../correct-received-resupply-line.command.js";
import { GetResupplyReceiptQuery } from "../get-resupply-receipt.query.js";
import { ReceiveSiteResupplyCommand } from "../receive-site-resupply.command.js";
import { CRO_24, DAY, placed, SITE, setup } from "./resupply-receipt-setup.js";

/**
 * La réception pré-remplie de l'emballé au colisage (réassort, lot R3b,
 * `plan-reapprovisionnement.md` §13.1 point 6) : l'emballé s'il est connu,
 * sinon le demandé ; le compte du comptoir fait foi (décision C).
 */
describe("la réception d'un réassort colisé", () => {
  const CRO_PAC = [
    ...CRO_24,
    { sku: "PAC", label: "Pain au chocolat", quantity: 12, saleUnit: "piece" as const },
  ];

  it("montre l'emballé comme attendu avant « Réceptionner »", async () => {
    const { resupplies, packed, read } = setup();
    resupplies.put(placed("resupply_1", CRO_PAC));
    packed.closed.set(
      "resupply_1",
      new Map([
        ["CRO", { quantity: 20, saleUnit: "piece" as const }],
        ["PAC", { quantity: 0, saleUnit: "piece" as const }],
      ]),
    );

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));

    expect(view.receptions[0]?.lines).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        expectedQuantity: 20,
        receivedQuantity: null,
        saleUnit: "piece",
      },
      {
        sku: "PAC",
        label: "Pain au chocolat",
        expectedQuantity: 0,
        receivedQuantity: null,
        saleUnit: "piece",
      },
    ]);
  });

  it("réceptionne l'emballé, pas le demandé", async () => {
    const { resupplies, packed, receiveResupply, read } = setup();
    resupplies.put(placed("resupply_1", CRO_PAC));
    packed.closed.set(
      "resupply_1",
      new Map([
        ["CRO", { quantity: 20, saleUnit: "piece" as const }],
        ["PAC", { quantity: 12, saleUnit: "piece" as const }],
      ]),
    );

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]?.lines).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        expectedQuantity: 20,
        receivedQuantity: 20,
        saleUnit: "piece",
      },
      {
        sku: "PAC",
        label: "Pain au chocolat",
        expectedQuantity: 12,
        receivedQuantity: 12,
        saleUnit: "piece",
      },
    ]);
  });

  it("sans fiche close (Labo, ou colisage en cours), l'attendu reste le demandé", async () => {
    const { resupplies, receiveResupply, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));

    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]?.lines).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        expectedQuantity: 24,
        receivedQuantity: 24,
        saleUnit: "piece",
      },
    ]);
  });

  it("un emballé connu APRÈS la réception ne change rien : le comptoir fait foi", async () => {
    const { resupplies, packed, receiveResupply, correctReceived, read } = setup();
    resupplies.put(placed("resupply_1", CRO_24));
    await receiveResupply.execute(new ReceiveSiteResupplyCommand(SITE, "resupply_1", "staff_lou"));
    await correctReceived.execute(
      new CorrectReceivedResupplyLineCommand(SITE, "resupply_1", "CRO", 22, "staff_lou"),
    );

    packed.closed.set(
      "resupply_1",
      new Map([["CRO", { quantity: 18, saleUnit: "piece" as const }]]),
    );

    const view = await read.execute(new GetResupplyReceiptQuery(SITE, DAY));
    expect(view.receptions[0]?.lines).toEqual([
      {
        sku: "CRO",
        label: "Croissant",
        expectedQuantity: 24,
        receivedQuantity: 22,
        saleUnit: "piece",
      },
    ]);
    expect(view.stock[0]).toMatchObject({ sku: "CRO", receivedQuantity: 22 });
  });
});
