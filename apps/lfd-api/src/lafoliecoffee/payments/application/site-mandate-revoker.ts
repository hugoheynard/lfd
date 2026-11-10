import { Injectable } from "@nestjs/common";

import { SiteMandateRevocation } from "../../account/domain/ports/site-mandate-revocation.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { MandateRevokedEvent } from "../domain/events/payment-mandate.events.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { SiteMandatesReader } from "../domain/ports/site-mandates.reader.js";
import { mandateCompanyOf } from "./mandate-journal-names.js";

/**
 * Le côté `payments` de la révocation qu'`account` déclare
 * (`SiteMandateRevocation`) : chaque mandat passe par l'agrégat (`revoke`
 * refuse ce qui n'est plus révocable), s'écrit, et s'inscrit au journal
 * (`payment_mandate.revoked`) — dans la transaction de l'appelant.
 */
@Injectable()
export class SiteMandateRevoker extends SiteMandateRevocation {
  constructor(
    private readonly sites: SiteMandatesReader,
    private readonly mandates: PaymentMandateRepository,
    private readonly events: DomainEventPublisher,
  ) {
    super();
  }

  async revokeNaming(siteId: string, payerId: string, at: Date): Promise<void> {
    const found = await this.sites.revocableNaming(siteId, payerId);
    if (found.length === 0) {
      return;
    }
    const company = await mandateCompanyOf(this.mandates, siteId);
    for (const mandate of found) {
      const previousStatus = mandate.status;
      mandate.revoke(at);
      await this.mandates.save(mandate);
      await this.events.publishTraced(
        new MandateRevokedEvent(mandate.id, company, mandate.reference, previousStatus),
      );
    }
  }
}
