import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";
import { Clock } from "../../../platform/time/clock.js";
import { CounterHandoverDesk } from "../../channels/commerce/counter-handover.desk.js";
import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../channels/commerce/handover-subject.reader.js";
import {
  CounterOutOfReachError,
  CounterTokenMismatchError,
  HandoverRefusedError,
  HandoverTokenNotFoundError,
} from "../../domain/errors/handover-errors.js";
import { counterReachBlocker } from "../../domain/services/counter-reach.js";
import type { HandoverVia } from "../../domain/services/handover.js";
import { counterReachSubjectOf } from "./counter-reach-subject.js";
import { HandoverAttestation } from "./handover-attestation.service.js";

/**
 * Sans jeton, le départ décidé au comptoir est une remise SAISIE : le vendeur
 * l'atteste seul — la même trace que « Remettre » par numéro. Avec le jeton
 * de la commande, c'est un scan (Hugo, 2026-11-03).
 */
const SEIZED_VIA: HandoverVia = "manual";
const SCANNED_VIA: HandoverVia = "scan";

/** Le retrait ne connaît plus la commande : le commerce ne la sert plus. Partagée avec l'aperçu (C1b). */
export const NOT_SERVED_REASON =
  "Cette commande n'est plus servie par le commerce : ne la remettez pas, et rechargez la file du comptoir.";

/**
 * L'implémentation du guichet (plan
 * `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.2, §4.3) :
 * la garde du comptoir, puis la règle de `HandoverAttestation` — la même que
 * le scan et la saisie, sous le même verrou de la commande. Tourne dans
 * l'unité de travail du commerce ; n'en ouvre pas.
 */
@Injectable()
export class AttestingCounterHandoverDesk extends CounterHandoverDesk {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
    private readonly clock: Clock,
  ) {
    super();
  }

  async vet(orderId: string, by: string, token: string | null): Promise<void> {
    const subject = await this.subjectOf(orderId);
    const blocker = counterReachBlocker(
      counterReachSubjectOf(subject),
      instantToLocal(this.clock.now()).day,
    );
    if (blocker !== null) {
      throw new CounterOutOfReachError(blocker);
    }
    const via = await this.viaOf(orderId, token);
    await this.attestation.vet(subject, FIRST_SHIPMENT_RANK, by, via);
  }

  async handOver(orderId: string, by: string, token: string | null): Promise<void> {
    const subject = await this.subjectOf(orderId);
    const via = await this.viaOf(orderId, token);
    await this.attestation.attestQuietly(subject, FIRST_SHIPMENT_RANK, by, via);
  }

  /** Le jeton, s'il y en a un, doit désigner CETTE commande : c'est lui qui fait du geste un scan. */
  private async viaOf(orderId: string, token: string | null): Promise<HandoverVia> {
    if (token === null) {
      return SEIZED_VIA;
    }
    const scanned = await this.subjects.byToken(token);
    if (scanned === null) {
      throw new HandoverTokenNotFoundError();
    }
    if (scanned.orderId !== orderId) {
      throw new CounterTokenMismatchError(scanned.orderNumber);
    }
    return SCANNED_VIA;
  }

  private async subjectOf(orderId: string): Promise<HandoverSubject> {
    const subject = await this.subjects.byOrderId(orderId);
    if (subject === null) {
      throw new HandoverRefusedError(NOT_SERVED_REASON);
    }
    return subject;
  }
}
