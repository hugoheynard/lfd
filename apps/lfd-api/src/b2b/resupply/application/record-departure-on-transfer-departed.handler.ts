import { Injectable, Logger } from "@nestjs/common";

import {
  DELIVERY_TRANSFER_DEPARTED,
  TransferDepartedFact,
} from "../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import type { SiteResupplyDeparture } from "../domain/site-resupply.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_DEPARTURE_ON_TRANSFER_DEPARTED = "b2b.resupply-departure-on-transfer-departed";

/**
 * **La tournée qui porte le transfert est partie : ses réassorts sont
 * « partis »** (R4d, `reassort-boutiques/plan-au-plus-tot.md` §1). Pose
 * « Parti à HH:MM (livreur) », à l'instant du départ et au nom du livreur,
 * jamais à ceux de la livraison du fait.
 *
 * Un AFFICHAGE, rien de plus : aucun refus ne le lit, et « Réceptionner »
 * reste permis avant comme après.
 *
 * Abonné DURABLE (`lint:durable-cross-block`). Rejoué, il ne pose rien de
 * plus (`recordDeparture` rend `false`). Un réassort introuvable sous le
 * point du transfert est écarté et journalisé : lever ferait relivrer le
 * fait sans fin pour un affichage sans objet.
 */
@Injectable()
@DurableHandler({
  type: DELIVERY_TRANSFER_DEPARTED,
  subscriber: RECORD_DEPARTURE_ON_TRANSFER_DEPARTED,
})
export class RecordDepartureOnTransferDeparted implements DurableSubscriber {
  private readonly logger = new Logger(RecordDepartureOnTransferDeparted.name);

  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly staff: StaffDirectory,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = TransferDepartedFact.fromPayload(delivery.payload);
    if (fact.resupplyIds.length === 0) {
      return;
    }
    const departure: SiteResupplyDeparture = {
      at: fact.departedAt,
      byName: await this.driverNameOf(fact.driverStaffId),
    };
    for (const resupplyId of fact.resupplyIds) {
      await this.depart(fact.siteId, resupplyId, departure);
    }
  }

  /** Le nom du livreur tel que l'annuaire le connaît maintenant ; `null` sinon. */
  private async driverNameOf(driverStaffId: string | null): Promise<string | null> {
    if (driverStaffId === null) {
      return null;
    }
    const agent = await this.staff.identify(driverStaffId);
    return agent === null || agent.name === "" ? null : agent.name;
  }

  private async depart(
    siteId: string,
    resupplyId: string,
    departure: SiteResupplyDeparture,
  ): Promise<void> {
    const resupply = await this.resupplies.load(siteId, resupplyId);
    if (resupply === null) {
      this.logger.warn(
        `Réassort ${resupplyId} du transfert parti vers le point ${siteId} : introuvable sous ce ` +
          `point, « parti » n'est pas affiché.`,
      );
      return;
    }
    if (resupply.recordDeparture(departure)) {
      await this.resupplies.save(resupply);
    }
  }
}
