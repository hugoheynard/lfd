import { Injectable } from "@nestjs/common";

import {
  IssuedDraftMandates,
  type IssuerDraftVoidingCause,
  type IssuerDraftVoidingChannel,
  type VoidedDraftMandate,
} from "../../accounting/domain/ports/issued-draft-mandates.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { IssuedDraftsReader } from "../domain/ports/issued-drafts.reader.js";
import { voidDrafts } from "./draft-mandate-voiding.js";
import { ringDraftVoided } from "./mandate-staff-bell.js";

/**
 * `payments` répond au port que la comptabilité déclare : **révoquer les
 * brouillons d'un émetteur** dont un réglage imprimé vient de changer.
 *
 * Aucune séquence neuve : la révocation passe par `voidDrafts` — la même que
 * celle d'un RIB réécrit, fait `payment_mandate.draft_voided` compris — et la
 * cloche par `ringDraftVoided`. Deux chemins qui révoqueraient chacun à leur
 * façon finiraient par ne pas journaliser la même chose.
 */
@Injectable()
export class IssuerDraftVoiding extends IssuedDraftMandates {
  constructor(
    private readonly issued: IssuedDraftsReader,
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly notifier: StaffNotifier,
  ) {
    super();
  }

  async voidDraftsOf(
    creditorId: string,
    cause: IssuerDraftVoidingCause,
    via: IssuerDraftVoidingChannel,
  ): Promise<readonly VoidedDraftMandate[]> {
    const ids = await this.issued.draftIdsIssuedBy(creditorId);
    const loaded = await Promise.all(ids.map((id) => this.mandates.findById(id)));
    // Le statut est relu sur l'agrégat : `revoke` accepte aussi un ACTIF, et un
    // actif garde son schéma jusqu'à son remplacement — il ne doit jamais passer ici.
    const drafts = loaded.filter(
      (draft): draft is PaymentMandate => draft !== null && draft.status === "draft",
    );
    const deps = {
      mandates: this.mandates,
      clock: this.clock,
      events: this.events,
      uow: this.uow,
    };
    await voidDrafts(deps, drafts, { cause, via });
    return drafts.map((draft) => ({
      id: draft.id,
      companyId: draft.companyId,
      reference: draft.reference,
    }));
  }

  async announceVoided(
    voided: readonly VoidedDraftMandate[],
    cause: IssuerDraftVoidingCause,
  ): Promise<void> {
    const deps = { notifier: this.notifier, mandates: this.mandates, clock: this.clock };
    for (const draft of voided) {
      await ringDraftVoided(deps, draft, cause);
    }
  }
}
