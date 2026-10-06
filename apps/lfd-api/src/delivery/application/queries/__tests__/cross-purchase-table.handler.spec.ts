import type {
  BinTypeView,
  PurchaseBinCandidateView,
  PurchaseTablePayload,
  PurchaseVehicleCandidateView,
} from "@lfd/contracts";

import { InvalidBinGapError } from "../../../domain/errors/delivery-floor-errors.js";
import {
  PurchaseTableItemArchivedError,
  PurchaseTableItemNotFoundError,
  PurchaseTableVehicleWithoutCargoError,
} from "../../../domain/errors/delivery-purchase-table-errors.js";
import { PurchaseBinCandidatesReader } from "../../../domain/ports/purchase-bin-candidates.reader.js";
import { PurchaseVehicleCandidatesReader } from "../../../domain/ports/purchase-vehicle-candidates.reader.js";
import { FixedBinCatalog } from "../../commands/__tests__/bin-doubles.js";
import { FixedFleet, vehicleView } from "../../commands/__tests__/routing-doubles.js";
import { CrossPurchaseTableHandler } from "../cross-purchase-table.handler.js";
import { CrossPurchaseTableQuery } from "../cross-purchase-table.query.js";

/** Les candidats, figés — archivés compris, comme `list(true)`. */
class FixedVehicleCandidates extends PurchaseVehicleCandidatesReader {
  constructor(private readonly candidates: readonly PurchaseVehicleCandidateView[]) {
    super();
  }

  list(includeArchived: boolean): Promise<readonly PurchaseVehicleCandidateView[]> {
    return Promise.resolve(this.candidates.filter((c) => includeArchived || c.archivedAt === null));
  }
}

class FixedBinCandidates extends PurchaseBinCandidatesReader {
  constructor(private readonly candidates: readonly PurchaseBinCandidateView[]) {
    super();
  }

  list(includeArchived: boolean): Promise<readonly PurchaseBinCandidateView[]> {
    return Promise.resolve(this.candidates.filter((c) => includeArchived || c.archivedAt === null));
  }
}

const EPOCH = new Date(0).toISOString();
const COMMON = {
  reference: null,
  purchaseUrl: null,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  updatedBy: { staffUserId: "s1", name: "", role: "" },
  archivedAt: null,
};
const CARGO = { lengthCm: 100, widthCm: 100, heightCm: 50, volumeLiters: 500 };

const vehicleCandidate = (
  id: string,
  name: string,
  priceCentsExclVat: number | null,
  archivedAt: string | null = null,
): PurchaseVehicleCandidateView => ({
  ...COMMON,
  id,
  name,
  archivedAt,
  cargo: CARGO,
  wheelArches: null,
  priceCentsExclVat,
});

// Grand : 6 bacs de 30 L = 180 L dans 100 × 100 × 50, jeu 0.
const GRAND = {
  outer: { lengthMm: 600, widthMm: 400, heightMm: 200 },
  inner: { lengthMm: 500, widthMm: 300, heightMm: 200 },
  innerVolumeLiters: 30,
  isotherm: false,
  maxStack: 5,
};

const binCandidate = (
  id: string,
  name: string,
  unitPriceCentsExclVat: number | null,
  archivedAt: string | null = null,
): PurchaseBinCandidateView => ({
  ...COMMON,
  ...GRAND,
  id,
  name,
  archivedAt,
  supplier: null,
  unitPriceCentsExclVat,
});

/** Le même format, en type de bac : au millimètre. */
const GRAND_TYPE = {
  ...GRAND,
  outer: { lengthMm: 600, widthMm: 400, heightMm: 200 },
  inner: { lengthMm: 500, widthMm: 300, heightMm: 200 },
};

const binType = (id: string, name: string, archivedAt: string | null = null): BinTypeView => ({
  ...GRAND_TYPE,
  id,
  name,
  divisible: false,
  archivedAt,
});

const handler = new CrossPurchaseTableHandler(
  new FixedVehicleCandidates([
    vehicleCandidate("vc1", "Kangoo", 1_000_000),
    vehicleCandidate("vc-old", "Trafic", 2_000_000, EPOCH),
  ]),
  new FixedBinCandidates([
    binCandidate("bc1", "Caisse Dupont", 1_290),
    binCandidate("bc-old", "Caisse Dupont 50", 900, EPOCH),
  ]),
  new FixedFleet([
    { ...vehicleView("v1", "Camion 1"), cargo: CARGO },
    vehicleView("v-bare", "Camion nu"),
    { ...vehicleView("v-gone", "Camion 2", EPOCH), cargo: CARGO },
  ]),
  new FixedBinCatalog([binType("bt1", "Bac maison"), binType("bt-old", "Bac ancien", EPOCH)], []),
);

const run = (selection: PurchaseTablePayload): ReturnType<CrossPurchaseTableHandler["execute"]> =>
  handler.execute(new CrossPurchaseTableQuery(selection));

const SELECTION: PurchaseTablePayload = {
  vehicles: [
    { source: "candidate", id: "vc1" },
    { source: "fleet", id: "v1" },
  ],
  formats: [
    { source: "candidate", id: "bc1" },
    { source: "bin_type", id: "bt1" },
  ],
  gapCm: 0,
};

describe("CrossPurchaseTableHandler (B-D4)", () => {
  it("relit candidats et réels, et rend les coûts connus — les autres à null", async () => {
    const view = await run(SELECTION);

    expect(view.formats).toEqual([
      {
        source: "candidate",
        id: "bc1",
        name: "Caisse Dupont",
        innerVolumeLiters: 30,
        unitPriceCentsExclVat: 1_290,
      },
      {
        source: "bin_type",
        id: "bt1",
        name: "Bac maison",
        innerVolumeLiters: 30,
        unitPriceCentsExclVat: null,
      },
    ]);
    const [candidate, fleet] = view.rows;
    expect(candidate).toMatchObject({
      source: "candidate",
      name: "Kangoo",
      vehicleVolumeLiters: 500,
      priceCentsExclVat: 1_000_000,
      best: { occupation: 0, volume: 0, costPerLiter: 0 },
    });
    // 6 × 1 290 = 7 740 ; 1 007 740 ÷ 180 L = 5 598,56 → 5 599 c/L.
    expect(candidate?.cells[0]).toMatchObject({
      total: 6,
      usefulLiters: 180,
      vehiclePercent: 36,
      equipmentCostCents: 7_740,
      totalCostCents: 1_007_740,
      costPerLiterCents: 5_599,
    });
    expect(candidate?.cells[1]).toMatchObject({
      total: 6,
      equipmentCostCents: null,
      costPerLiterCents: null,
    });
    // La flotte n'a pas de prix : l'équipement se calcule quand même (B-Q3).
    expect(fleet).toMatchObject({ source: "fleet", name: "Camion 1", priceCentsExclVat: null });
    expect(fleet?.cells[0]).toMatchObject({
      equipmentCostCents: 7_740,
      totalCostCents: null,
      costPerLiterCents: null,
    });
    expect(view.bestRowByCostPerLiter).toBe(0);
  });

  it.each([
    [
      { ...SELECTION, vehicles: [{ source: "candidate" as const, id: "nope" }] },
      "véhicule candidat",
    ],
    [
      { ...SELECTION, vehicles: [{ source: "fleet" as const, id: "vc1" }] },
      "véhicule de la flotte",
    ],
    [{ ...SELECTION, formats: [{ source: "candidate" as const, id: "bt1" }] }, "format candidat"],
    [{ ...SELECTION, formats: [{ source: "bin_type" as const, id: "nope" }] }, "type de bac"],
  ])(
    "un identifiant introuvable se refuse en 404 en nommant sa sorte (%#)",
    async (selection, label) => {
      await expect(run(selection)).rejects.toThrow(PurchaseTableItemNotFoundError);
      await expect(run(selection)).rejects.toThrow(label);
    },
  );

  it.each([
    [
      { ...SELECTION, formats: [{ source: "candidate" as const, id: "bc-old" }] },
      "Le format « Caisse Dupont 50 » a été archivé — retirez-le de la sélection.",
    ],
    [
      { ...SELECTION, formats: [{ source: "bin_type" as const, id: "bt-old" }] },
      "Le format « Bac ancien » a été archivé",
    ],
    [
      { ...SELECTION, vehicles: [{ source: "candidate" as const, id: "vc-old" }] },
      "Le véhicule « Trafic » a été archivé",
    ],
    [
      { ...SELECTION, vehicles: [{ source: "fleet" as const, id: "v-gone" }] },
      "« Camion 2 » a été retiré de la flotte",
    ],
  ])(
    "un élément archivé ou retiré se refuse en 409 en le nommant (%#)",
    async (selection, message) => {
      await expect(run(selection)).rejects.toThrow(PurchaseTableItemArchivedError);
      await expect(run(selection)).rejects.toThrow(message);
    },
  );

  it("un véhicule de la flotte sans espace utile se refuse en le nommant", async () => {
    const selection = { ...SELECTION, vehicles: [{ source: "fleet" as const, id: "v-bare" }] };

    await expect(run(selection)).rejects.toThrow(PurchaseTableVehicleWithoutCargoError);
    await expect(run(selection)).rejects.toThrow("« Camion nu »");
  });

  it("un jeu hors bornes se refuse au domaine", async () => {
    await expect(run({ ...SELECTION, gapCm: 11 })).rejects.toThrow(InvalidBinGapError);
  });
});
