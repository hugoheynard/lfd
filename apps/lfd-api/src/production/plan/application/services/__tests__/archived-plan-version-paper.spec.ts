import type { Buffer } from "node:buffer";

import { AmbientAfterCommit } from "../../../../../platform/database/after-commit.js";
import {
  CommitQueue,
  runInTransaction,
} from "../../../../../platform/database/transaction.store.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedEventFunctionSheets } from "../../../../channels/events/__tests__/event-function-sheets-doubles.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import type { ProductionDay } from "../../../../day/index.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import {
  OrderSheetPaper,
  ProductionPaperArchive,
  productionCountPdfKey,
} from "../../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import { DOSSIER_ARTICLES, NoAdminOrigin } from "../../__tests__/dossier-dispatch-doubles.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { CLOSED, DAY, closedDay } from "../../handlers/__tests__/send-dossier-scene.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import { ArchivedPlanVersionPaper } from "../archived-plan-version-paper.js";
import { DossierFunctionSheetsReading } from "../dossier-function-sheets-reading.service.js";
import { ProductionPaperRenderer } from "../production-paper.service.js";

/**
 * **Le papier d'une version, rangé au geste** (`les-versions-du-plan.md`) : rien avant la validation, le compte et le
 * dossier sous la version de la journée après, et un échec qui ne retient
 * rien. La journée est celle de la scène du dossier : son jour est dérivé de
 * maintenant, l'instant de l'arrêt n'est que recopié.
 */

/** La transaction du geste : jamais lue, seulement ambiante. */
const GESTURE_TX = {};

/** Le stockage dont la lecture lève une erreur non classée : le papier ne se fabrique pas. */
class BrokenStore extends InMemoryProductionStore {
  override readIfPresent(): Promise<Buffer | null> {
    return Promise.reject(new RangeError("archive illisible"));
  }
}

/** La journée arrêtée de la scène du dossier, numérotée jusqu'à `version`. */
function versionedDay(version = 1): ProductionDay {
  const day = closedDay();
  for (let n = 1; n <= version; n += 1) {
    day.numberPlanVersion(n);
  }
  return day;
}

function setup(
  store: InMemoryProductionStore = new InMemoryProductionStore(),
  notes = FixedPlannedDeliveryNotes.forEveryOrder(),
) {
  const work = new BackgroundWork();
  const renderer = new ProductionPaperRenderer(
    new GroupingSourceReading(...placementPorts(DOSSIER_ARTICLES)),
    new OrderSheetPaper(new NoAdminOrigin(), new FixedOrderPrintColors(), new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    notes,
    new InMemoryDisplaySettings().reader(),
    new FixedTrancheReading(),
    new DossierFunctionSheetsReading(new FixedEventFunctionSheets()),
  );
  const paper = new ArchivedPlanVersionPaper(
    renderer,
    new ProductionPaperArchive(store),
    new AmbientAfterCommit(),
    work,
  );
  return { paper, store, work };
}

/** Le geste tel que l'unité de travail le fait tourner : sa transaction, puis la validation. */
async function gesture(work: () => void, commits = new CommitQueue()): Promise<CommitQueue> {
  await runInTransaction(GESTURE_TX, () => Promise.resolve(work()), commits);
  return commits;
}

describe("ArchivedPlanVersionPaper", () => {
  it("ne fabrique rien avant la validation, puis range le compte et le dossier sous la version", async () => {
    const { paper, store, work } = setup();
    const day = versionedDay(1);

    const commits = await gesture(() => paper.requestAfterCommit(day));
    await work.whenIdle();
    expect(store.objects.size).toBe(0);

    commits.flush();
    await work.whenIdle();

    expect([...store.objects.keys()].sort()).toEqual(
      [productionCountPdfKey(DAY, CLOSED, null, 1), dayDossierPdfKey(DAY, CLOSED, null, 1)].sort(),
    );
  });

  it("un geste dont la transaction n'est pas validée ne fabrique rien", async () => {
    const { paper, store, work } = setup();

    await gesture(() => paper.requestAfterCommit(versionedDay(1)));
    await work.whenIdle();

    expect(store.objects.size).toBe(0);
  });

  it("une version suivante se range sous son numéro, sans toucher la précédente", async () => {
    const { paper, store, work } = setup();
    (await gesture(() => paper.requestAfterCommit(versionedDay(1)))).flush();
    await work.whenIdle();

    (await gesture(() => paper.requestAfterCommit(versionedDay(2)))).flush();
    await work.whenIdle();

    expect(store.objects.has(dayDossierPdfKey(DAY, CLOSED, null, 1))).toBe(true);
    expect(store.objects.has(dayDossierPdfKey(DAY, CLOSED, null, 2))).toBe(true);
    expect(store.objects.has(productionCountPdfKey(DAY, CLOSED, null, 2))).toBe(true);
  });

  it("un dossier non archivable (BL absents) n'est pas rangé ; le compte l'est quand même", async () => {
    const { paper, store, work } = setup(
      new InMemoryProductionStore(),
      new FixedPlannedDeliveryNotes(new Map(), true),
    );

    (await gesture(() => paper.requestAfterCommit(versionedDay(1)))).flush();
    await work.whenIdle();

    expect([...store.objects.keys()]).toEqual([productionCountPdfKey(DAY, CLOSED, null, 1)]);
  });

  /** § 2 bis point 3 : le papier part hors transaction, son échec ne retient rien. */
  it("un papier qui échoue ne fait pas échouer le geste, et l'échec est absorbé après journal", async () => {
    const { paper, store, work } = setup(new BrokenStore());

    const commits = await gesture(() => paper.requestAfterCommit(versionedDay(1)));
    commits.flush();

    await expect(work.whenIdle()).resolves.toBeUndefined();
    expect(store.objects.size).toBe(0);
  });
});
