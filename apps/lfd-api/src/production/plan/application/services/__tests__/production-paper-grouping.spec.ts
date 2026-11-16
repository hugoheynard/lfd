import { instantToLocal, type CatalogFamilyView } from "@lfd/contracts";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { WorkshopShelvesReader } from "../../../../channels/commerce/workshop-shelves.reader.js";
import { CROISSANT, closedDay } from "../../../../day/application/__tests__/closed-day-doubles.js";
import { ServiceDay } from "../../../../day/index.js";
import { CapturedLogs } from "../../../../shared/print/application/__tests__/captured-logs.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { OrderSheetPaper, ProductionDisplaySettings } from "../../../../shared/print/index.js";
import {
  FailingWorkstationOfProducts,
  FixedWorkstationOfProducts,
  UnreadWorkstationOfProducts,
  article,
  placementPorts,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { WorkstationOfProducts } from "../../../../workstations/index.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { DossierGroupingReading } from "../dossier-grouping-reading.service.js";
import { ProductionPaperRenderer } from "../production-paper.service.js";

/**
 * **Le dossier du jour selon le mode** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.4–3.5) : le mode boutique ne lit
 * pas les postes ; en mode prod, le dossier n'est archivable que si les
 * postes ont été lus, et chaque tirage non archivable est journalisé avec sa
 * cause. Le jour est dérivé de maintenant ; la clôture n'est que recopiée.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const CLOSED = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const SALTY: CatalogFamilyView = { id: "fam-salty", name: "Traiteur salé", position: 1 };

class Shelves extends WorkshopShelvesReader {
  asked = 0;
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    this.asked += 1;
    return Promise.resolve(new Map([[CROISSANT, SALTY]]));
  }
}

class NoAdminOrigin extends AppConfig {
  override adminBaseUrl(): string | null {
    return null;
  }
}

/** Les deux commandes du double de journée, arrêtées il y a deux heures. */
const theDay = () => closedDay(ServiceDay.of(DAY), CLOSED, []);

function renderer(
  grouping: "shelf" | "workstation",
  workstations: WorkstationOfProducts,
  tranches = new FixedTrancheReading(),
) {
  const shelves = new Shelves();
  const papers = new ProductionPaperRenderer(
    new DossierGroupingReading(
      shelves,
      ...placementPorts([article(CROISSANT, "VIE", SALTY)], workstations),
    ),
    new OrderSheetPaper(new NoAdminOrigin(), new FixedOrderPrintColors(), new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    new FixedPlannedDeliveryNotes(),
    new InMemoryDisplaySettings(
      ProductionDisplaySettings.of({ showSubcategories: false, grouping }),
    ).reader(),
    tranches,
  );
  return { papers, shelves };
}

const PASTRY = new FixedWorkstationOfProducts(
  [{ id: "ws_pastry", name: "Pâtisserie", position: 0 }],
  new Map([["VIE", "ws_pastry"]]),
);

describe("ProductionPaperRenderer — le dossier selon le mode", () => {
  let logs: CapturedLogs;

  beforeEach(() => {
    logs = CapturedLogs.capture();
  });

  afterEach(() => {
    logs.release();
  });

  it("mode boutique : rangé par rayon, sans lire les postes, archivable", async () => {
    const workstations = new UnreadWorkstationOfProducts();
    const { papers, shelves } = renderer("shelf", workstations);

    const paper = await papers.dossierOf(theDay());

    expect(paper.archivable).toBe(true);
    expect(workstations.calls).toBe(0);
    expect(shelves.asked).toBe(1);
    expect(pdfPages(paper.bytes).join("")).toContain("Traiteur salé");
    expect(logs.warnings).toEqual([]);
  });

  it("mode prod, postes lus : rangé par poste, archivable", async () => {
    const { papers, shelves } = renderer("workstation", PASTRY);

    const paper = await papers.dossierOf(theDay());

    expect(paper.archivable).toBe(true);
    expect(shelves.asked).toBe(0);
    expect(pdfPages(paper.bytes).join("")).toContain("Pâtisserie");
  });

  it("mode prod, postes en panne : rangé par rayon, journalisé, non archivé", async () => {
    const { papers, shelves } = renderer("workstation", new FailingWorkstationOfProducts());

    const paper = await papers.dossierOf(theDay());

    expect(paper.archivable).toBe(false);
    expect(shelves.asked).toBe(1);
    expect(pdfPages(paper.bytes).join("")).toContain("Traiteur salé");
    expect(logs.errors).toEqual([expect.stringContaining("postes illisibles")]);
    expect(logs.warnings).toEqual([expect.stringContaining("(illisibles : postes)")]);
  });

  it("chaque cause d'un tirage non archivable est journalisée", async () => {
    const { papers } = renderer(
      "workstation",
      new FailingWorkstationOfProducts(),
      new FixedTrancheReading(null),
    );

    const paper = await papers.dossierOf(theDay());

    expect(paper.archivable).toBe(false);
    expect(logs.warnings).toEqual([expect.stringContaining("(illisibles : tranches, postes)")]);
  });
});
