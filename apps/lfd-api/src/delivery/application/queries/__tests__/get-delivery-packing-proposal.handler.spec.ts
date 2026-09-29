import { BinsNotDeclarableError } from "../../../domain/errors/delivery-loading-errors.js";
import { FixedBinCatalog, FixedDeliveryProducts } from "../../commands/__tests__/bin-doubles.js";
import { FixedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import { GetDeliveryBinFreeHalvesHandler } from "../get-delivery-bin-free-halves.handler.js";
import { GetDeliveryBinFreeHalvesQuery } from "../get-delivery-bin-free-halves.query.js";
import { GetDeliveryPackingProposalHandler } from "../get-delivery-packing-proposal.handler.js";
import { GetDeliveryPackingProposalQuery } from "../get-delivery-packing-proposal.query.js";
import {
  binRow,
  binTypeView,
  deliveryOrder,
  FixedLoading,
  FixedOrderLines,
  roundRow,
} from "./packing-doubles.js";

const ORDERS = [
  deliveryOrder("o1", "LIV-1"),
  deliveryOrder("o2", "LIV-2"),
  deliveryOrder("o3", "LIV-3"),
];

const CATALOG = new FixedBinCatalog(
  [
    binTypeView("bin_s", { isotherm: true, heightCm: 10 }),
    binTypeView("bin_m"),
    binTypeView("bin_old", { archived: true }),
  ],
  [
    { binTypeId: "bin_m", sku: "VIE-001", units: 24 },
    { binTypeId: "bin_s", sku: "TAR-001", units: 4 },
  ],
);

const PRODUCTS = new FixedDeliveryProducts([
  { sku: "VIE-001", name: "Croissant", requiresCold: false },
  { sku: "TAR-001", name: "Tarte", requiresCold: true },
]);

const LINES = new FixedOrderLines(
  new Map([
    [
      "o2",
      [
        { sku: "VIE-001", name: "Croissant", quantity: 6 },
        { sku: "TAR-001", name: "Tarte", quantity: 2 },
        { sku: "VIE-001", name: "Croissant", quantity: 4 },
        { sku: "PAI-009", name: "Pain retiré", quantity: 1 },
      ],
    ],
  ]),
);

function proposalHandler(loading = new FixedLoading([])) {
  return new GetDeliveryPackingProposalHandler(
    new FixedDeliveryOrders(ORDERS),
    LINES,
    PRODUCTS,
    CATALOG,
    loading,
  );
}

describe("GetDeliveryPackingProposalHandler", () => {
  it("fusionne les lignes, y croise le froid de la fiche, et propose par type en service", async () => {
    const view = await proposalHandler().execute(new GetDeliveryPackingProposalQuery("o2"));

    expect(view.reference).toBe("LIV-2");
    expect(view.lines).toEqual([
      { sku: "VIE-001", name: "Croissant", quantity: 10, requiresCold: false },
      { sku: "TAR-001", name: "Tarte", quantity: 2, requiresCold: true },
      { sku: "PAI-009", name: "Pain retiré", quantity: 1, requiresCold: false },
    ]);
    expect(view.bins).toEqual([
      {
        binTypeId: "bin_s",
        binTypeName: "Bac bin_s",
        isotherm: true,
        cold: true,
        whole: 1,
        half: false,
        fill: 0.5,
        content: [{ sku: "TAR-001", quantity: 2 }],
      },
      {
        binTypeId: "bin_m",
        binTypeName: "Bac bin_m",
        isotherm: false,
        cold: false,
        whole: 0,
        half: true,
        fill: 0.83,
        content: [{ sku: "VIE-001", quantity: 10 }],
      },
    ]);
    expect(view.unplaced).toEqual([
      { sku: "PAI-009", name: "Pain retiré", quantity: 1, reason: "no_capacity" },
    ]);
    expect(view.shareCandidate).toBeNull();
  });

  it("propose la moitié libre d'un arrêt consécutif, en dernier recours", async () => {
    const loading = new FixedLoading([
      roundRow("r1", [
        { orderId: "o1", bins: [binRow("b1", "o1")] },
        { orderId: "o2" },
        { orderId: "o3" },
      ]),
    ]);

    const view = await proposalHandler(loading).execute(new GetDeliveryPackingProposalQuery("o2"));

    expect(view.shareCandidate).toEqual({
      partnerOrderId: "o1",
      partnerReference: "LIV-1",
      partnerBinId: "b1",
      binTypeId: "bin_m",
      binTypeName: "Bac bin_m",
      replacesBinIndex: 1,
    });
  });

  it("ne propose aucun partage dans une tournée partie, ni loin de l'arrêt", async () => {
    const departed = new FixedLoading([
      roundRow(
        "r1",
        [{ orderId: "o1", bins: [binRow("b1", "o1")] }, { orderId: "o2" }],
        new Date(0),
      ),
    ]);
    const far = new FixedLoading([
      roundRow("r1", [
        { orderId: "o1", bins: [binRow("b1", "o1")] },
        { orderId: "o3" },
        { orderId: "o2" },
      ]),
    ]);

    const query = new GetDeliveryPackingProposalQuery("o2");
    expect((await proposalHandler(departed).execute(query)).shareCandidate).toBeNull();
    expect((await proposalHandler(far).execute(query)).shareCandidate).toBeNull();
  });

  it("refuse une commande que le commerce ne connaît pas, comme la déclaration", async () => {
    await expect(
      proposalHandler().execute(new GetDeliveryPackingProposalQuery("inconnue")),
    ).rejects.toBeInstanceOf(BinsNotDeclarableError);
  });
});

describe("GetDeliveryBinFreeHalvesHandler", () => {
  it("rend la tournée de la commande et les moitiés libres voisines, nommées", async () => {
    const loading = new FixedLoading([
      roundRow("r1", [
        { orderId: "o1", bins: [binRow("b1", "o1")] },
        { orderId: "o2" },
        { orderId: "o3", bins: [binRow("b3", "o3", { half: "right" })] },
      ]),
    ]);
    const handler = new GetDeliveryBinFreeHalvesHandler(loading, new FixedDeliveryOrders(ORDERS));

    const view = await handler.execute(new GetDeliveryBinFreeHalvesQuery("o2"));

    expect(view.round).toEqual({
      roundId: "r1",
      day: "2026-10-01",
      vehicleName: "Camionnette 1",
      passage: 1,
      position: 2,
      departedAt: null,
    });
    expect(
      view.halves.map(({ binId, reference, customerLabel, position, freeHalf }) => ({
        binId,
        reference,
        customerLabel,
        position,
        freeHalf,
      })),
    ).toEqual([
      {
        binId: "b1",
        reference: "LIV-1",
        customerLabel: "Client LIV-1",
        position: 1,
        freeHalf: "right",
      },
      {
        binId: "b3",
        reference: "LIV-3",
        customerLabel: "Client LIV-3",
        position: 3,
        freeHalf: "left",
      },
    ]);
  });

  it("hors de toute tournée : aucune tournée, aucune moitié", async () => {
    const handler = new GetDeliveryBinFreeHalvesHandler(
      new FixedLoading([]),
      new FixedDeliveryOrders(ORDERS),
    );

    expect(await handler.execute(new GetDeliveryBinFreeHalvesQuery("o2"))).toEqual({
      orderId: "o2",
      reference: "LIV-2",
      round: null,
      halves: [],
    });
  });
});
