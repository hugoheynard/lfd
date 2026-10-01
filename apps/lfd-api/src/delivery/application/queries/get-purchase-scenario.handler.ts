import type { PurchaseScenarioView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  PurchaseScenarioNotFoundError,
  PurchaseScenarioUnreadableError,
} from "../../domain/errors/delivery-purchase-scenario-errors.js";
import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { PurchaseBinCandidatesReader } from "../../domain/ports/purchase-bin-candidates.reader.js";
import { PurchaseScenariosReader } from "../../domain/ports/purchase-scenarios.reader.js";
import { PurchaseVehicleCandidatesReader } from "../../domain/ports/purchase-vehicle-candidates.reader.js";
import { selectionIssues } from "../purchase-scenario-issues.js";
import type { PurchaseTableSources } from "../purchase-table-support.js";
import { GetPurchaseScenarioQuery } from "./get-purchase-scenario.query.js";

/**
 * Un scénario rouvert (B-D5). Son contenu est revalidé : s'il ne passe plus
 * la forme, le refus le nomme (409), jamais une 500. Ses éléments cités sont
 * relus comme le tableau les relirait — archivés compris, pour les NOMMER —
 * et ce qui ne passerait plus est rendu dans `issues` plutôt que refusé :
 * l'écran doit pouvoir ouvrir le scénario pour le corriger.
 *
 * @throws {PurchaseScenarioNotFoundError} @throws {PurchaseScenarioUnreadableError}
 */
@QueryHandler(GetPurchaseScenarioQuery)
export class GetPurchaseScenarioHandler implements IQueryHandler<
  GetPurchaseScenarioQuery,
  PurchaseScenarioView
> {
  constructor(
    private readonly scenarios: PurchaseScenariosReader,
    private readonly vehicleCandidates: PurchaseVehicleCandidatesReader,
    private readonly binCandidates: PurchaseBinCandidatesReader,
    private readonly fleet: FleetReader,
    private readonly binCatalog: BinCatalogReader,
  ) {}

  async execute({ scenarioId }: GetPurchaseScenarioQuery): Promise<PurchaseScenarioView> {
    const record = await this.scenarios.byId(scenarioId);
    if (record === null) {
      throw new PurchaseScenarioNotFoundError(scenarioId);
    }
    if (!record.stored.readable) {
      throw new PurchaseScenarioUnreadableError(record.name, record.stored.reason);
    }
    const { selection, display } = record.stored.content;
    return {
      id: record.id,
      name: record.name,
      selection,
      display,
      updatedAt: record.updatedAt.toISOString(),
      archivedAt: record.archivedAt?.toISOString() ?? null,
      issues: selectionIssues(selection, await this.sources()),
    };
  }

  private async sources(): Promise<PurchaseTableSources> {
    const [vehicleCandidates, binCandidates, fleet, binTypes] = await Promise.all([
      this.vehicleCandidates.list(true),
      this.binCandidates.list(true),
      this.fleet.list(),
      this.binCatalog.listTypes(),
    ]);
    return { vehicleCandidates, binCandidates, fleet, binTypes };
  }
}
