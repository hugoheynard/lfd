import { DossierFunctionSheetsReading } from "../services/dossier-function-sheets-reading.service.js";
import { FixedEventFunctionSheets } from "../../../channels/events/__tests__/event-function-sheets-doubles.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import { CommerceDayVersionReader } from "../../../channels/commerce/commerce-day-version.reader.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import {
  OrderWithdrawalsReader,
  ProductionDayStatusReader,
  type ServiceDay,
} from "../../../day/index.js";
import { InMemoryDisplaySettings } from "../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { FixedPaperLogo } from "../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { OrderSheetPaper } from "../../../shared/print/index.js";
import { placementPorts } from "../../../workstations/application/__tests__/placement-doubles.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { ProvisionalPrint } from "../../domain/entities/provisional-print.js";
import { ProvisionalPrintLedger } from "../../domain/ports/provisional-print.ledger.js";
import {
  ProvisionalPrintPruner,
  type StaleProvisionalPrint,
} from "../../domain/ports/provisional-print.pruner.js";
import {
  type ProvisionalPrintSummary,
  ProvisionalPrintsReader,
} from "../../domain/ports/provisional-prints.reader.js";
import { ProductionPaperRenderer } from "../services/production-paper.service.js";
import { DOSSIER_ARTICLES, NoAdminOrigin } from "./dossier-dispatch-doubles.js";
import { FixedTrancheReading } from "./tranche-reading-doubles.js";

/** La table `provisional_print`, en mémoire, que les trois doubles partagent. */
export class ProvisionalPrintTable {
  readonly rows: ProvisionalPrint[] = [];

  ofDay(day: string): readonly ProvisionalPrint[] {
    return this.rows
      .filter((print) => print.state.serviceDay === day)
      .sort((a, b) => a.state.run - b.state.run);
  }
}

function summaryOf(print: ProvisionalPrint): ProvisionalPrintSummary {
  const { id, run, printedAt, printedBy, commerceVersion, functionSheetIds } = print.state;
  return { id, run, printedAt, printedBy, commerceVersion, functionSheetIds };
}

/**
 * L'écriture : l'unicité (journée, numéro) comme en base. `stolen` : des
 * numéros qu'une autre impression prend juste avant l'écriture — le premier
 * appel les voit libres, l'écriture les trouve pris.
 */
export class InMemoryProvisionalLedger extends ProvisionalPrintLedger {
  readonly stolen = new Set<number>();
  readonly trace: string[] = [];

  constructor(private readonly table: ProvisionalPrintTable) {
    super();
  }

  lastRunOf(day: ServiceDay): Promise<number> {
    const runs = this.table.ofDay(day.value).map((print) => print.state.run);
    return Promise.resolve(Math.max(0, ...runs));
  }

  record(print: ProvisionalPrint): Promise<boolean> {
    const { serviceDay, run } = print.state;
    this.trace.push(`record:#${String(run)}`);
    if (this.stolen.delete(run)) {
      this.table.rows.push(ProvisionalPrint.drawn({ ...print.state, id: `thief-${String(run)}` }));
      return Promise.resolve(false);
    }
    if (this.table.ofDay(serviceDay).some((row) => row.state.run === run)) {
      return Promise.resolve(false);
    }
    this.table.rows.push(print);
    return Promise.resolve(true);
  }
}

/** La lecture, sur la même table. */
export class InMemoryProvisionalReader extends ProvisionalPrintsReader {
  constructor(private readonly table: ProvisionalPrintTable) {
    super();
  }

  ofDay(day: ServiceDay): Promise<readonly ProvisionalPrintSummary[]> {
    return Promise.resolve(this.table.ofDay(day.value).map(summaryOf));
  }

  find(day: ServiceDay, id: string): Promise<ProvisionalPrintSummary | null> {
    const found = this.table.ofDay(day.value).find((print) => print.state.id === id);
    return Promise.resolve(found === undefined ? null : summaryOf(found));
  }

  fingerprintsOf(day: ServiceDay, run: number): Promise<ReadonlyMap<string, string> | null> {
    const found = this.table.ofDay(day.value).find((print) => print.state.run === run);
    return Promise.resolve(found === undefined ? null : found.state.orderFingerprints);
  }
}

/** Le balayage, sur la même table. */
export class InMemoryProvisionalPruner extends ProvisionalPrintPruner {
  constructor(private readonly table: ProvisionalPrintTable) {
    super();
  }

  staleBefore(day: string): Promise<readonly StaleProvisionalPrint[]> {
    return Promise.resolve(
      this.table.rows
        .filter((print) => print.state.serviceDay < day)
        .map(({ state }) => ({ id: state.id, serviceDay: state.serviceDay, run: state.run })),
    );
  }

  forget(ids: readonly string[]): Promise<number> {
    const before = this.table.rows.length;
    const kept = this.table.rows.filter((print) => !ids.includes(print.state.id));
    this.table.rows.splice(0, this.table.rows.length, ...kept);
    return Promise.resolve(before - kept.length);
  }
}

/** La version du commerce, posée par le test. */
export class FixedCommerceVersion extends CommerceDayVersionReader {
  constructor(public version = 0) {
    super();
  }

  versionOf(): Promise<number> {
    return Promise.resolve(this.version);
  }
}

/** La journée arrêtée, ou non, posée par le test. */
export class ArrestedOrNot extends ProductionDayStatusReader {
  constructor(private readonly closed: boolean) {
    super();
  }

  isClosed(): Promise<boolean> {
    return Promise.resolve(this.closed);
  }
}

/** Les commandes retirées par l'équipe, posées par le test. */
export class FixedWithdrawals extends OrderWithdrawalsReader {
  constructor(private readonly withdrawn: readonly string[] = []) {
    super();
  }

  withdrawnOn(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.withdrawn));
  }
}

/** Aucun auteur connu. */
export class NoAuthors extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(StaffAuthors.none());
  }
}

/** Le rendu réel des papiers, sur les doubles du dossier : le croissant en Viennoiseries. */
export function provisionalRenderer(): ProductionPaperRenderer {
  return new ProductionPaperRenderer(
    new GroupingSourceReading(...placementPorts(DOSSIER_ARTICLES)),
    new OrderSheetPaper(new NoAdminOrigin(), new FixedOrderPrintColors(), new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    new FixedPlannedDeliveryNotes(),
    new InMemoryDisplaySettings().reader(),
    new FixedTrancheReading(),
    new DossierFunctionSheetsReading(new FixedEventFunctionSheets()),
  );
}
