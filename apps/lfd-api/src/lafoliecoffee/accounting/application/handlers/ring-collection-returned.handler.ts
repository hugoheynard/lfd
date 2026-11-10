import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  CollectionReturnedEvent,
  returnedBatchLabel,
} from "../../domain/events/collection-return.events.js";

const RING_COLLECTION_RETURNED = "ring-collection-returned";

/**
 * **« Prélèvement rejeté »** (plan `retours-bancaires.md`) : la
 * banque a renvoyé une ligne, ses commandes ne sont plus prélevées, et
 * quelqu'un doit décider de la suite. Sans destinataire nommé, comme
 * `RingRefundNotCredited`. Pas de blocage automatique du client (A36) : la
 * cloche le dit, le staff décide. Une clé par retour : rejouée, elle ne sonne
 * pas deux fois.
 *
 * Le fait est publié DANS la transaction qui enregistre le retour : la cloche
 * attend sa validation. Lancée tout de suite, elle héritait de la transaction
 * ambiante et l'écrivait une fois close (P2028, constaté le 2026-10-21 sur
 * `seed:invoices`) — et un retour annulé aurait sonné quand même.
 */
@EventsHandler(CollectionReturnedEvent)
export class RingCollectionReturned implements IEventHandler<CollectionReturnedEvent> {
  private readonly logger = new Logger(RingCollectionReturned.name);

  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
    private readonly afterCommit: AfterCommit,
  ) {}

  handle(event: CollectionReturnedEvent): void {
    this.afterCommit.defer(
      () => this.work.track(this.run(event), RING_COLLECTION_RETURNED),
      RING_COLLECTION_RETURNED,
    );
  }

  private async run(event: CollectionReturnedEvent): Promise<void> {
    const { bankReturn, line } = event;
    const state = bankReturn.toPersistence();
    const reason = bankReturn.reason;
    const revoke = reason.proposesRevocation
      ? " Le motif dit que le mandat ne tient plus : envisager de le révoquer."
      : "";
    try {
      await this.notifier.notify([
        {
          kind: "collection.returned",
          subject: `Prélèvement rejeté — ${line.debtorName}`,
          body:
            `${returnedBatchLabel(line)}, ligne ${line.rank} : ${euros(state.amountCents)} ` +
            `revenus le ${state.returnedOn} (${reason.description}). Re-présenter, régler ` +
            `autrement ou passer en perte depuis « Prélèvement du mois ».${revoke}`,
          link: `/comptes-clients/${line.debtorCompanyId}/facturation`,
          idempotencyKey: `notification:collection.returned:${state.id}`,
          occurredAt: this.clock.now(),
        },
      ]);
    } catch (error) {
      this.logger.error(`Cloche « prélèvement rejeté » non émise (${state.id})`, error);
    }
  }
}

/** « 1 234,56 € » — pour un message, pas pour un calcul. */
function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
