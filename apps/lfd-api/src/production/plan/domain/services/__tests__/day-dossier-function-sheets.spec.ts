import { Buffer } from "node:buffer";

import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import { dayDossierOf } from "../day-dossier.js";
import { type DossierStamp, renderDayDossierPdf } from "../day-dossier-pdf.js";
import {
  type EventSheetsInput,
  type PreparedEventSheets,
  preparedFunctionSheetsOf,
  printedSheetIdsOf,
} from "../day-dossier-function-sheets-pdf.js";
import { DOSSIER_PARTS, type DossierPart, WHOLE_DOSSIER } from "../day-dossier-selection.js";
import { PAPER_LOGO } from "../../../../shared/print/domain/services/__tests__/paper-logo.fixture.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import {
  depositedPdf,
  pageCountOf,
} from "../../../../../platform/pdf/__tests__/function-sheet-pdf.fixture.js";

/**
 * **Les fiches de fonction au dossier du jour** : un intercalaire par
 * événement, les pages des PDF déposés à la suite, comptées par le folio.
 *
 * Les instants ne sont que recopiés dans le pied — rien ne les compare à
 * l'horloge (exception étroite du §5).
 */
const DAY = "2026-10-08";
const STAMP: DossierStamp = {
  serviceDay: DAY,
  closedAt: new Date("2026-10-07T18:00:00.000Z"),
  closedBy: null,
  retakenAt: null,
  retakenByName: null,
  printRun: 1,
};

function order(reference: string): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    rank: 1,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "delivery",
    destination: "3 rue du Four",
    dueAt: "07:30",
    clientele: null,
    siteId: null,
    offPlan: false,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4, saleUnit: "piece" }],
  };
}

const DOSSIER = dayDossierOf([order("ORD-0001")], new Map());

function rendered(
  functionSheets: readonly PreparedEventSheets[] | null | undefined,
  parts: readonly DossierPart[] = DOSSIER_PARTS,
): Promise<Buffer> {
  return renderDayDossierPdf(
    DOSSIER,
    STAMP,
    {
      logo: PAPER_LOGO,
      colisageUrlOf: () => "",
      colors: new Map(),
      resupplyColors: new Map(),
      deliveryNotes: new Map(),
      ...(functionSheets === undefined ? {} : { functionSheets }),
    },
    [],
    { selection: { ...WHOLE_DOSSIER, parts: new Set(parts) }, notice: null },
  );
}

async function wedding(
  ...sheets: EventSheetsInput["sheets"]
): Promise<readonly PreparedEventSheets[]> {
  return preparedFunctionSheetsOf([{ eventName: "Mariage Dupont", sheets }]);
}

describe("le dossier du jour et les fiches de fonction", () => {
  it("ajoute à la fin un intercalaire puis chaque page des fiches, dans l'ordre", async () => {
    const without = await pageCountOf(await rendered(undefined));
    const sheets = await wedding(
      { sheetId: "s1", fileName: "deroule.pdf", bytes: await depositedPdf("Déroulé", 2) },
      { sheetId: "s2", fileName: "buffet.pdf", bytes: await depositedPdf("Buffet", 1) },
    );

    const pdf = await rendered(sheets);

    expect(await pageCountOf(pdf)).toBe(without + 1 + 3);
    const text = pdfPages(pdf).join("\n");
    expect(text).toContain("Événement : Mariage Dupont");
    expect(text).toContain("1. deroule.pdf");
    expect(text).toContain("2 pages");
    expect(printedSheetIdsOf(sheets)).toEqual(["s1", "s2"]);
  });

  it("le folio compte les pages des fiches : la dernière page dit N/N", async () => {
    const sheets = await wedding({
      sheetId: "s1",
      fileName: "deroule.pdf",
      bytes: await depositedPdf("Déroulé", 2),
    });

    const pdf = await rendered(sheets);
    const total = await pageCountOf(pdf);

    expect(pdfPages(pdf).join("\n")).toContain(`${String(total)}/${String(total)}`);
  });

  it("une fiche illisible prend une page qui le dit, à sa place, sans faire échouer le dossier", async () => {
    const without = await pageCountOf(await rendered(undefined));
    const sheets = await wedding(
      { sheetId: "bad", fileName: "classeur.xlsx.pdf", bytes: Buffer.from("PK pas un PDF") },
      { sheetId: "ok", fileName: "buffet.pdf", bytes: await depositedPdf("Buffet", 1) },
    );

    const pdf = await rendered(sheets);

    expect(await pageCountOf(pdf)).toBe(without + 1 + 1 + 1);
    const text = pdfPages(pdf).join("\n");
    expect(text).toContain("Fiche illisible : classeur.xlsx.pdf");
    expect(text).toContain("illisible");
    expect(printedSheetIdsOf(sheets)).toEqual(["bad", "ok"]);
  });

  it("des fiches en panne : le pied dit que le dossier part sans elles", async () => {
    const text = pdfPages(await rendered(null)).join("\n");
    expect(text).toContain("sans les fiches de fonction");
  });

  it("la partie décochée n'imprime ni intercalaire ni fiche, et le pied ne dit rien", async () => {
    const sheets = await wedding({
      sheetId: "s1",
      fileName: "deroule.pdf",
      bytes: await depositedPdf("Déroulé", 2),
    });
    const parts = DOSSIER_PARTS.filter((part) => part !== "functionSheets");

    const pdf = await rendered(sheets, parts);
    const panne = pdfPages(await rendered(null, parts)).join("\n");

    expect(await pageCountOf(pdf)).toBe(await pageCountOf(await rendered(undefined)));
    expect(pdfPages(pdf).join("\n")).not.toContain("Mariage Dupont");
    expect(panne).not.toContain("sans les fiches de fonction");
  });

  it("un événement sans fiche en vigueur ne prend pas d'intercalaire", async () => {
    expect(await preparedFunctionSheetsOf([{ eventName: "Vide", sheets: [] }])).toEqual([]);
  });
});
