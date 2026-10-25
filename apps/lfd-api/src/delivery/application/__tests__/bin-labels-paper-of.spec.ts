import type { DeliveryBinView } from "@lfd/contracts";

import { BinLabelsNothingToPrintError } from "../../domain/errors/delivery-bin-label-errors.js";
import { binLabelsPaperOf } from "../bin-labels-paper-of.js";

// Un instant recopié, jamais comparé à l'horloge.
const AT = new Date(1_000);
const CONTEXT = { adminBaseUrl: "https://admin.test/", printedAt: AT };

function bin(over: Partial<DeliveryBinView> = {}): DeliveryBinView {
  return {
    binId: "b1",
    code: "A3KM7Q",
    orderId: "ord_1",
    transfer: null,
    reference: "ORD-0042",
    customerLabel: "Le Refuge",
    index: 1,
    total: 2,
    voidedAt: null,
    binType: { id: "t_m", name: "Bac M", isotherm: false, archived: false },
    half: null,
    physicalBinId: null,
    innerBags: 0,
    sharedWith: null,
    toRedo: false,
    ...over,
  };
}

const ROUND = {
  roundId: "r1",
  day: "2030-03-12",
  vehicleName: "Camion 1",
  passage: 2,
  position: 4,
  departedAt: null,
};

describe("binLabelsPaperOf", () => {
  it("compose les phrases de l'étiquette : rang, type et moitié, partage, sacs, QR du bac", () => {
    const paper = binLabelsPaperOf(
      {
        title: "ORD-0042",
        bins: [
          bin({
            half: "left",
            innerBags: 2,
            sharedWith: {
              binId: "b7",
              orderId: "ord_7",
              reference: "ORD-7",
              customerLabel: "La Cantine",
            },
          }),
        ],
        round: ROUND,
        color: "#123456",
      },
      [],
      CONTEXT,
    );
    expect(paper.round).toEqual({ title: "Camion 1 · passage 2", stop: 4 });
    expect(paper.labels).toEqual([
      {
        reference: "ORD-0042",
        customerLabel: "Le Refuge",
        indexLabel: "bac 1 / 2",
        kind: "Bac M · ½ gauche",
        sharedWith: "partagé avec ORD-7 · La Cantine",
        innerBags: "2 sacs dedans",
        code: "A3KM7Q",
        qrUrl: "https://admin.test/livraison/bac/b1",
      },
    ]);
  });

  it("seuls les bacs vivants, et la sélection de `?bacs=`", () => {
    const bins = [
      bin({ binId: "b0", voidedAt: "2030-03-12T05:00:00.000Z", index: null }),
      bin({ binId: "b1" }),
      bin({ binId: "b2", index: 2 }),
    ];
    const source = { title: "ORD-0042", bins, round: null, color: null };
    expect(binLabelsPaperOf(source, [], CONTEXT).labels.map((one) => one.qrUrl)).toEqual([
      "https://admin.test/livraison/bac/b1",
      "https://admin.test/livraison/bac/b2",
    ]);
    expect(binLabelsPaperOf(source, ["b2"], CONTEXT).labels).toHaveLength(1);
    expect(() => binLabelsPaperOf(source, ["b0"], CONTEXT)).toThrow(BinLabelsNothingToPrintError);
  });

  it("un bac de transfert prend le titre « Transfert <site> » : la flèche n'existe pas sur le papier", () => {
    const transferBin = bin({
      orderId: null,
      transfer: { transferId: "tr_1", siteLabel: "Val Village" },
      reference: "→ Val Village",
      customerLabel: "Val Village",
    });
    const paper = binLabelsPaperOf(
      { title: "Transfert Val Village", bins: [transferBin], round: null, color: null },
      [],
      CONTEXT,
    );
    expect(paper.labels[0]?.reference).toBe("Transfert Val Village");
  });

  it("sans origine du back-office, pas de QR", () => {
    const paper = binLabelsPaperOf(
      { title: "ORD-0042", bins: [bin()], round: null, color: null },
      [],
      { adminBaseUrl: null, printedAt: AT },
    );
    expect(paper.labels[0]?.qrUrl).toBe("");
  });

  it("refuse un propriétaire sans bac vivant", () => {
    expect(() =>
      binLabelsPaperOf({ title: "ORD-0042", bins: [], round: null, color: null }, [], CONTEXT),
    ).toThrow(BinLabelsNothingToPrintError);
  });
});
