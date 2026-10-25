import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PackingRevisionDesk,
  type PackingDueLine,
  type PackingRevisionOutcome,
} from "../../channels/commerce/index.js";
import { PackingSheetRevisedEvent } from "../../domain/events/packing-sheet-revised.events.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";

/**
 * L'implémentation du guichet de la révision au colisage — cf.
 * {@link PackingRevisionDesk} (plan A2, § 2.2 et § 7).
 *
 * 1. La feuille, sous verrou. Absente → `sheet_missing` : la liste à coliser
 *    n'est pas encore arrivée, et la feuille ne s'écrit pas sans inventer son
 *    en-tête (§ 7, B2).
 * 2. Fermée → `packed` ; un bac de livraison vivant → `delivery_bin`. Rien
 *    n'est écrit.
 * 3. `PackingSheet.reviseDue`, gardée (feuille retirée, départ décidé, sous
 *    le bac), puis la sauvegarde et le fait `packing_sheet.revised` —
 *    seulement si une ligne a changé.
 *
 * Tourne dans l'unité de travail de l'appelant : elle la REJOINT.
 */
@Injectable()
export class PackingSheetRevisionDesk extends PackingRevisionDesk {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {
    super();
  }

  async revise(
    serviceDay: string,
    orderId: string,
    lines: readonly PackingDueLine[],
    revisedBy: string,
  ): Promise<PackingRevisionOutcome> {
    return this.uow.run(async () => {
      const sheet = await this.sheets.lock(serviceDay, orderId);
      if (sheet === null) {
        return "sheet_missing";
      }
      if (sheet.packed !== null) {
        return "packed";
      }
      if (sheet.liveBinIds.length > 0) {
        return "delivery_bin";
      }
      const changed = sheet.reviseDue(lines, { at: this.clock.now(), by: revisedBy });
      if (changed.length === 0) {
        return "revised";
      }
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingSheetRevisedEvent(sheet.serviceDay, sheet.orderId, sheet.reference, changed),
      );
      return "revised";
    });
  }
}
