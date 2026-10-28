import { itemContentsOf } from "../transfer-contents.js";
import { frozenResupply, resupplyContentsOver } from "./resupply-transfer-doubles.js";
import { FixedTransferContents, plannedTransfer } from "./transfer-doubles.js";

/*
 * Le contenu d'un réassort dans le transfert (réassort, lot R3c) : sa copie
 * figée à l'arrêt, l'emballé quand la fiche du colisage est close, sinon le
 * demandé. Des jours comparés entre eux seulement, jamais à l'horloge.
 */
const DAY = "2030-03-12";
const AT = new Date(0);
const CROISSANT = { sku: "CRO-001", productName: "Croissant" };

function transferWith(resupplyId: string) {
  const transfer = plannedTransfer("t_1", DAY, AT, ["o_1"]);
  transfer.attach(
    { itemId: "t_1_r", item: { kind: "resupply", resupplyId } },
    { siteId: "site_vv", serviceDay: DAY },
    AT,
  );
  return transfer;
}

const ORDERS = new FixedTransferContents(
  new Map([["o_1", [{ sku: "PAIN", name: "Pain", quantity: 2, saleUnit: "piece" as const }]]]),
);

describe("le réassort au manifeste du transfert", () => {
  it("fiche pas encore close : la quantité demandée, dans la section des réassorts", async () => {
    const transfer = transferWith("res_vv");
    const contents = await itemContentsOf(
      ORDERS,
      resupplyContentsOver([frozenResupply("res_vv", DAY, { quantity: 6 })]),
      [transfer],
    );

    const manifest = transfer.manifest(contents);

    expect(manifest.resupplies.items).toEqual([
      {
        itemId: "t_1_r",
        kind: "resupply",
        subjectId: "res_vv",
        lines: [{ ...CROISSANT, quantity: 6 }],
      },
    ]);
    expect(manifest.orders.totals).toEqual([{ sku: "PAIN", productName: "Pain", quantity: 2 }]);
  });

  it("fiche close : l'emballé fait foi, et une ligne emballée à zéro ne part pas", async () => {
    const transfer = transferWith("res_vv");
    const frozen = frozenResupply("res_vv", DAY, { quantity: 6 });
    const withTwo = {
      ...frozen,
      lines: [
        ...frozen.lines,
        {
          sku: "PAC-001",
          productName: "Pain au chocolat",
          quantity: 3,
          saleUnit: "piece" as const,
        },
      ],
    };
    const packed = new Map([["res_vv", new Map([["CRO-001", 4]])]]);

    const contents = await itemContentsOf(ORDERS, resupplyContentsOver([withTwo], packed), [
      transfer,
    ]);

    expect(transfer.manifest(contents).resupplies.totals).toEqual([{ ...CROISSANT, quantity: 4 }]);
  });

  it("un réassort que le fournil ne porte plus (journée rouverte) : contenu inconnu, rien d'inventé", async () => {
    const transfer = transferWith("res_vv");

    const contents = await itemContentsOf(ORDERS, resupplyContentsOver(), [transfer]);

    expect(transfer.manifest(contents).resupplies.items[0]?.lines).toEqual([]);
  });

  it("le départ fige l'emballé : le manifeste ne bouge plus ensuite", async () => {
    const transfer = transferWith("res_vv");
    const packed = new Map([["res_vv", new Map([["CRO-001", 5]])]]);
    transfer.depart(
      AT,
      await itemContentsOf(ORDERS, resupplyContentsOver([frozenResupply("res_vv", DAY)], packed), [
        transfer,
      ]),
    );

    const after = transfer.manifest(() => undefined);

    expect(after.resupplies.totals).toEqual([{ ...CROISSANT, quantity: 5 }]);
  });
});
