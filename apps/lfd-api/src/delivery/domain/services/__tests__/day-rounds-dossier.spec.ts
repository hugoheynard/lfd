import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { BRAND_LOGO } from "../../../../platform/brand/__tests__/fixed-brand-logo.js";
import type { LoadingRoundRow } from "../../ports/delivery-loading.reader.js";
import { PlannedTiming } from "../../value-objects/planned-timing.js";
import {
  dayRoundsDossierOf,
  type DossierRound,
  tightestDeadlineOf,
} from "../day-rounds-dossier.js";
import { renderDayRoundsDossierPdf } from "../day-rounds-dossier-pdf.js";
import type { RoundPaper, RoundPaperSheetStop } from "../round-paper.js";

/** Les dates ne sont comparées qu'entre elles : rien ici ne lit l'horloge. */
const DAY = "2026-10-07";
const PRINTED = new Date("2026-10-06T16:00:00.000Z");

function sheet(reference: string, end: string | null, cancelled = false): RoundPaperSheetStop {
  return {
    kind: "sheet",
    reference,
    customerLabel: `Client ${reference}`,
    addressLines: [],
    window: end === null ? null : { start: null, end, source: "override" },
    contact: null,
    signatureRequired: false,
    binCodes: [],
    steps: [],
    orderNote: "",
    addressNote: null,
    cancelled,
    color: null,
  };
}

function paper(vehicleName: string, passage: number, departure: string | null): RoundPaper {
  return {
    vehicleName,
    passage,
    serviceDay: DAY,
    driverName: null,
    planned:
      departure === null
        ? null
        : PlannedTiming.of({
            departureAt: new Date(`${DAY}T${departure}:00.000Z`),
            returnAt: new Date(`${DAY}T23:00:00.000Z`),
            meters: 1000,
          }),
    stops: [sheet(`${vehicleName}-${String(passage)}`, "09:00")],
    printedAt: PRINTED,
  };
}

function loading(id: string): LoadingRoundRow {
  const bin = (binId: string, voided = false) => ({
    id: binId,
    owner: { kind: "order" as const, orderId: "o1" },
    code: binId,
    voidedAt: voided ? PRINTED : null,
    binType: { id: "t", name: "Bac", isotherm: false, archived: false },
    half: null,
    physicalBinId: null,
    innerBags: 0,
    partner: null,
  });
  return {
    id,
    serviceDay: DAY,
    vehicleName: "Camion 1",
    passage: 1,
    version: 1,
    departedAt: null,
    stops: [
      {
        kind: "order",
        orderId: "o1",
        stopId: "s1",
        siteLabel: null,
        siteId: null,
        position: 1,
        bins: [bin("b1"), bin("b2"), bin("b3", true)],
        loaded: new Map([["b1", PRINTED]]),
      },
      {
        kind: "transfer",
        transferId: "t1",
        stopId: "s2",
        siteLabel: "Val Village",
        siteId: "site_vv",
        position: 2,
        bins: [bin("b4")],
        loaded: new Map(),
      },
    ],
  };
}

function dossierOf(rounds: readonly DossierRound[]) {
  return dayRoundsDossierOf({
    serviceDay: DAY,
    printedAt: PRINTED,
    rounds,
    siteColors: new Map([["site_vv", "#8e24aa"]]),
    unplaced: [{ reference: "ORD-9", customerLabel: "Hôtel du Col" }],
  });
}

describe("dayRoundsDossierOf — la répartition du jour", () => {
  it("ordonne par heure de départ, puis passage ; sans horaire en dernier", () => {
    const dossier = dossierOf([
      { paper: paper("Sans heure", 1, null), loading: null },
      { paper: paper("Camion 2", 2, "06:00"), loading: null },
      { paper: paper("Camion 1", 1, "06:00"), loading: null },
      { paper: paper("Tôt", 1, "04:30"), loading: null },
    ]);
    expect(dossier.dispatch.map((row) => `${row.vehicleName}/${String(row.passage)}`)).toEqual([
      "Tôt/1",
      "Camion 1/1",
      "Camion 2/2",
      "Sans heure/1",
    ]);
    expect(dossier.papers.map((one) => one.vehicleName)).toEqual([
      "Tôt",
      "Camion 1",
      "Camion 2",
      "Sans heure",
    ]);
  });

  it("compte les bacs non annulés chargés / attendus, et nomme le transfert avec sa couleur", () => {
    const [row] = dossierOf([
      { paper: paper("Camion 1", 1, "06:00"), loading: loading("r1") },
    ]).dispatch;
    expect(row).toMatchObject({ binsLoaded: 1, binsExpected: 3, stopCount: 1 });
    expect(row?.transfers).toEqual([{ siteLabel: "Val Village", color: "#8e24aa" }]);
  });

  it("garde les livraisons non placées : elles ne disparaissent pas du dossier", () => {
    expect(dossierOf([]).unplaced).toEqual([{ reference: "ORD-9", customerLabel: "Hôtel du Col" }]);
  });
});

describe("tightestDeadlineOf", () => {
  it("prend la plus serrée, transferts compris, en ignorant les annulées et l'illisible", () => {
    expect(
      tightestDeadlineOf([
        sheet("a", "10:00"),
        sheet("b", "07:00", true),
        sheet("c", "9:15"),
        sheet("d", null),
        {
          kind: "transfer",
          siteLabel: "Village",
          addressLines: [],
          arrivalBy: "09:30",
          binCount: 0,
          orderCount: 0,
          orderColors: [],
          orderTotals: [],
          resupplyCount: 0,
          resupplyTotals: [],
          resupplyNames: [],
        },
      ]),
    ).toBe("9:15");
    expect(tightestDeadlineOf([sheet("x", "bientôt")])).toBeNull();
  });
});

describe("renderDayRoundsDossierPdf", () => {
  it("rend la répartition, puis chaque feuille titrée « véhicule · passage n »", async () => {
    const dossier = dossierOf([
      { paper: paper("Camion 2", 1, "07:00"), loading: null },
      { paper: paper("Camion 1", 1, "06:00"), loading: loading("r1") },
    ]);
    const pages = pdfPages(await renderDayRoundsDossierPdf(dossier, { logo: BRAND_LOGO }));
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("Répartition des tournées");
    expect(pages[0]).toContain("Transfert vers Val Village");
    expect(pages[0]).toContain("ORD-9");
    expect(pages[1]).toContain("Camion 1 · passage 1");
    expect(pages[1]).toContain("FEUILLE DE TOURNÉE");
    expect(pages[2]).toContain("Camion 2 · passage 1");
  });

  it("dit un jour sans tournée plutôt que de rendre une page vide", async () => {
    const pages = pdfPages(await renderDayRoundsDossierPdf(dossierOf([]), { logo: BRAND_LOGO }));
    expect(pages[0]).toContain("Aucune tournée composée pour ce jour.");
  });
});
