import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { CommerceDayVersionReader } from "../../../channels/commerce/commerce-day-version.reader.js";
import {
  ProductionDayRepository,
  ProductionDayStatusReader,
  ServiceDay,
} from "../../../day/index.js";
import {
  type ProvisionalPrintSummary,
  ProvisionalPrintsReader,
} from "../../domain/ports/provisional-prints.reader.js";
import { DossierGroupLabelsReading } from "../services/dossier-group-labels.js";
import { LiveDossierContent } from "../services/live-dossier-content.js";
import type { DossierContent } from "../services/production-paper.service.js";
import {
  GetPrintOptionsQuery,
  type ProductionPrintOptionsView,
} from "./get-print-options.query.js";

/**
 * **L'état de la fenêtre d'impression du dossier** : arrêté ou non, rayons ou
 * postes, commandes, impressions provisoires du jour, et « la journée a
 * changé depuis la dernière ».
 *
 * Arrêtée, la journée se lit dans ce qu'elle a figé ; sinon, dans ce que
 * l'arrêt figerait (`LiveDossierContent`), comme le tirage provisoire.
 */
@QueryHandler(GetPrintOptionsQuery)
export class GetPrintOptionsHandler implements IQueryHandler<
  GetPrintOptionsQuery,
  ProductionPrintOptionsView
> {
  constructor(
    private readonly status: ProductionDayStatusReader,
    private readonly days: ProductionDayRepository,
    private readonly live: LiveDossierContent,
    private readonly groups: DossierGroupLabelsReading,
    private readonly prints: ProvisionalPrintsReader,
    private readonly versions: CommerceDayVersionReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetPrintOptionsQuery): Promise<ProductionPrintOptionsView> {
    const day = ServiceDay.of(query.serviceDay);
    const arrested = await this.status.isClosed(day);
    const content = arrested ? await this.frozen(day) : await this.live.read(day);
    const [labels, prints] = await Promise.all([this.groups.read(content), this.prints.ofDay(day)]);
    const [names, changedSinceLast] = await Promise.all([
      this.authors.identify(prints.map((print) => print.printedBy)),
      arrested ? Promise.resolve(false) : this.changedSince(day, prints.at(-1)),
    ]);
    return {
      arrested,
      grouping: labels.grouping,
      groups: labels.labels,
      orders: content.orders.map(({ orderId, reference, customerLabel }) => ({
        orderId,
        reference,
        customerLabel,
      })),
      prints: prints.map((print) => ({
        id: print.id,
        run: print.run,
        printedAt: print.printedAt.toISOString(),
        printedByName: names.nameOf(print.printedBy),
      })),
      changedSinceLast,
    };
  }

  private async frozen(day: ServiceDay): Promise<DossierContent> {
    const snapshot = (await this.days.load(day)).toSnapshot();
    return {
      serviceDay: snapshot.serviceDay,
      orders: snapshot.orders,
      resupplies: snapshot.resupplies ?? [],
    };
  }

  private async changedSince(
    day: ServiceDay,
    last: ProvisionalPrintSummary | undefined,
  ): Promise<boolean> {
    if (last === undefined) {
      return false;
    }
    return (await this.versions.versionOf(day)) !== last.commerceVersion;
  }
}
