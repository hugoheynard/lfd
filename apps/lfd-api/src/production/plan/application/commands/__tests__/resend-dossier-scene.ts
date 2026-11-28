import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../../../mail/channels/requests/__tests__/recording-mail.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedEventFunctionSheets } from "../../../../channels/events/__tests__/event-function-sheets-doubles.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { PlanVersionSummaries, type ServiceDay } from "../../../../day/index.js";
import type { ProductionDay } from "../../../../day/index.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import { OrderSheetPaper, ProductionPaperArchive } from "../../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import {
  type DossierDispatchTrace,
  DossierDispatchesReader,
} from "../../../domain/ports/dossier-dispatches.reader.js";
import type { StoredDossierRecipient } from "../../../domain/ports/dossier-recipients.reader.js";
import {
  DispatchTable,
  DOSSIER_ARTICLES,
  NoAdminOrigin,
  OneDay,
} from "../../__tests__/dossier-dispatch-doubles.js";
import { Directory, RecipientsRows, staffCard } from "../../__tests__/dossier-recipient-doubles.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { DossierFunctionSheetsReading } from "../../services/dossier-function-sheets-reading.service.js";
import type { PlanVersionSummary } from "../../services/dossier-update-mail-data.js";
import { ProductionPaperRenderer } from "../../services/production-paper.service.js";
import { VersionDossierPaper } from "../../services/version-dossier-paper.js";
import { ResendPlanVersionDossierHandler } from "../resend-plan-version-dossier.handler.js";

/** Les traces doublées : posées par le test, servies pour le jour demandé. */
export class Traces extends DossierDispatchesReader {
  constructor(private readonly traces: readonly DossierDispatchTrace[]) {
    super();
  }

  of(): Promise<readonly DossierDispatchTrace[]> {
    return Promise.resolve(this.traces);
  }
}

/** Un résumé sans changement. */
export const EMPTY_SUMMARY: PlanVersionSummary = {
  production: [],
  changes: [],
  otherChanges: 0,
  resupplies: [],
  toCheck: [],
};

/**
 * Les résumés du noyau doublés : un résumé par version de départ, qui dit
 * d'où il part (le compte « avant » vaut la version de départ), et les
 * demandes reçues.
 */
export class SummariesBySince extends PlanVersionSummaries {
  readonly asked: [string, readonly number[], number][] = [];

  since(
    day: ServiceDay,
    froms: readonly number[],
    to: number,
  ): Promise<ReadonlyMap<number, PlanVersionSummary>> {
    this.asked.push([day.value, froms, to]);
    return Promise.resolve(
      new Map(
        froms.map((from) => [
          from,
          {
            ...EMPTY_SUMMARY,
            production: [
              {
                sku: "VIE-001",
                productName: "Croissant",
                saleUnit: "piece" as const,
                before: from,
                after: to,
                delta: to - from,
              },
            ],
          },
        ]),
      ),
    );
  }
}

/** Les ports qu'un test remplace. */
export interface ResendSceneOptions {
  readonly traces?: readonly DossierDispatchTrace[];
  readonly store?: InMemoryProductionStore;
}

/** Le renvoi, ses ports doublés, et ce qu'on observe. */
export function resendScene(
  rows: readonly StoredDossierRecipient[],
  day: ProductionDay,
  now: Date,
  options: ResendSceneOptions = {},
) {
  const uow = new OpenableUnitOfWork();
  const mail = new RecordingMail(uow);
  const log = new DispatchTable();
  const store = options.store ?? new InMemoryProductionStore();
  const summaries = new SummariesBySince();
  const ledger = new InMemoryGestureIntentLedger();
  const clock = new FixedClock(now);
  const events = new RecordingPublisher();
  const renderer = new ProductionPaperRenderer(
    new GroupingSourceReading(...placementPorts(DOSSIER_ARTICLES)),
    new OrderSheetPaper(new NoAdminOrigin(), new FixedOrderPrintColors(), new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    FixedPlannedDeliveryNotes.forEveryOrder(),
    new InMemoryDisplaySettings().reader(),
    new FixedTrancheReading(),
    new DossierFunctionSheetsReading(new FixedEventFunctionSheets()),
  );
  const handler = new ResendPlanVersionDossierHandler(
    new OneDay(day),
    new RecipientsRows(rows),
    new Directory().put(staffCard()),
    new Traces(options.traces ?? []),
    new VersionDossierPaper(renderer, new ProductionPaperArchive(store)),
    summaries,
    log,
    mail,
    uow,
    clock,
    new OncePerIntent(ledger, clock),
    events,
  );
  return { handler, mail, log, store, summaries, ledger, events };
}
