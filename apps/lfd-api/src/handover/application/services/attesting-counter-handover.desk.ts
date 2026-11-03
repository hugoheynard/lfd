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
  HandoverRefusedError,
} from "../../domain/errors/handover-errors.js";
import { counterReachBlocker } from "../../domain/services/counter-reach.js";
import type { HandoverVia } from "../../domain/services/handover.js";
import { HandoverAttestation } from "./handover-attestation.service.js";

/**
 * Le départ décidé au comptoir est une remise SAISIE : le vendeur l'atteste
 * seul, sans le code du client — la même trace que « Remettre » par numéro.
 */
const COUNTER_VIA: HandoverVia = "manual";

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

  async vet(orderId: string, by: string): Promise<void> {
    const subject = await this.subjectOf(orderId);
    const blocker = counterReachBlocker(
      {
        fulfillmentMethod: subject.fulfillmentMethod,
        // La clé de la file du comptoir, écrite comme elle (`expectedOn`).
        serviceDay: subject.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      },
      instantToLocal(this.clock.now()).day,
    );
    if (blocker !== null) {
      throw new CounterOutOfReachError(blocker);
    }
    await this.attestation.vet(subject, FIRST_SHIPMENT_RANK, by, COUNTER_VIA);
  }

  async handOver(orderId: string, by: string): Promise<void> {
    const subject = await this.subjectOf(orderId);
    await this.attestation.attestQuietly(subject, FIRST_SHIPMENT_RANK, by, COUNTER_VIA);
  }

  private async subjectOf(orderId: string): Promise<HandoverSubject> {
    const subject = await this.subjects.byOrderId(orderId);
    if (subject === null) {
      throw new HandoverRefusedError(
        "Cette commande n'est plus servie par le commerce : ne la remettez pas, et rechargez la file du comptoir.",
      );
    }
    return subject;
  }
}
