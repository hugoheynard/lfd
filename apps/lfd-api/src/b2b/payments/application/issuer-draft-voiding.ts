import { Injectable, Logger } from "@nestjs/common";

import {
  IssuedDraftMandates,
  type IssuerDraftVoidingCause,
  type IssuerDraftVoidingChannel,
  type VoidedDraftMandate,
} from "../../accounting/domain/ports/issued-draft-mandates.js";
import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DocumentStore } from "../../../platform/storage/document-store.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffNotifier } from "../../../staff/notifications/domain/ports/staff-notifier.js";
import type { PaymentMandate } from "../domain/entities/payment-mandate.js";
import { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";
import { IssuedDraftsReader } from "../domain/ports/issued-drafts.reader.js";
import { voidDrafts } from "./draft-mandate-voiding.js";
import { purgeVoidedDraftProof } from "./mandate-proof-purge.js";
import { ringDraftVoided } from "./mandate-staff-bell.js";

const LOGGER = new Logger("IssuerDraftVoiding");

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
    private readonly store: DocumentStore,
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
      await this.purgeProofOf(draft.id);
    }
  }

  /**
   * Purge la pièce d'un brouillon révoqué, **relu après la transaction** du
   * réglage (plan `documentation/comptabilite/plan-restes-du-mandat.md` §7 #10).
   *
   * Relu plutôt que transporté par `VoidedDraftMandate` : ce type appartient à
   * la comptabilité, et y faire passer une clé de stockage lui apprendrait un
   * détail du bucket des mandats. La relecture rend l'état validé, et c'est
   * l'agrégat relu qui dit si la pièce peut partir. Comme la cloche, la purge
   * ne fait jamais échouer le réglage : une relecture en panne va au log.
   */
  private async purgeProofOf(mandateId: string): Promise<void> {
    let reloaded: PaymentMandate | null;
    try {
      reloaded = await this.mandates.findById(mandateId);
    } catch (error) {
      LOGGER.warn(
        `Brouillon ${mandateId} révoqué, pièce non purgée (relecture impossible) : ${String(error)}`,
      );
      return;
    }
    if (reloaded !== null) {
      await purgeVoidedDraftProof(
        { store: this.store, events: this.events, mandates: this.mandates },
        reloaded,
      );
    }
  }
}
