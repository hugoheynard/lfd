import type { ProductionGrouping } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsReader,
} from "../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { dayDossierFrom } from "../../domain/services/day-dossier.js";
import type { DossierContent } from "./production-paper.service.js";

/** Les rayons, ou les postes, que le dossier d'un contenu porterait. */
export interface DossierGroupLabels {
  readonly grouping: ProductionGrouping;
  /** Leurs libellés, dans l'ordre du dossier : la clé d'une sélection. */
  readonly labels: readonly string[];
}

/**
 * **Les rayons ou postes du dossier, pour la fenêtre d'impression** — lus et
 * montés comme le dossier les range (`dayDossierFrom`, réglage d'affichage du
 * moment), si bien qu'un libellé coché est un libellé que le tirage connaît.
 */
@Injectable()
export class DossierGroupLabelsReading {
  constructor(
    private readonly grouping: GroupingSourceReading,
    private readonly display: ProductionDisplaySettingsReader,
  ) {}

  async read(content: DossierContent): Promise<DossierGroupLabels> {
    const settings = (await this.display.current()) ?? ProductionDisplaySettings.defaults();
    const skus = [
      ...content.orders.flatMap((order) => order.lines),
      ...content.resupplies.flatMap((resupply) => resupply.lines),
    ].map((line) => line.sku);
    const read = await this.grouping.read(
      skus,
      settings.grouping,
      `Fenêtre d'impression du ${content.serviceDay}`,
    );
    const dossier = dayDossierFrom(
      content.orders,
      read.source,
      content.resupplies,
      settings.showSubcategories,
    );
    return { grouping: settings.grouping, labels: dossier.recap.map((group) => group.label) };
  }
}
