import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  CounterHandoverPreviewReader,
  type CounterHandoverPreview,
} from "../../channels/commerce/counter-handover-preview.reader.js";
import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { counterReachOf } from "../../domain/services/counter-reach.js";
import { NOT_SERVED_REASON } from "./attesting-counter-handover.desk.js";
import { counterReachSubjectOf } from "./counter-reach-subject.js";
import { HandoverAttestation } from "./handover-attestation.service.js";

/**
 * L'aperçu du guichet du comptoir (C1b, 2026-11-03) : la garde du comptoir,
 * puis la règle de remise de `HandoverAttestation` — dans l'ordre de
 * `AttestingCounterHandoverDesk.vet`, sans verrou ni écriture.
 */
@Injectable()
export class PreviewingCounterHandoverReader extends CounterHandoverPreviewReader {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly attestation: HandoverAttestation,
    private readonly clock: Clock,
  ) {
    super();
  }

  async previewOf(orderId: string): Promise<CounterHandoverPreview> {
    const subject = await this.subjects.byOrderId(orderId);
    if (subject === null) {
      return { kind: "refused", reason: NOT_SERVED_REASON };
    }
    const reach = counterReachOf(
      counterReachSubjectOf(subject),
      instantToLocal(this.clock.now()).day,
    );
    if (reach !== null) {
      return { kind: "out_of_reach", refusal: reach };
    }
    const reason = await this.attestation.refusalOf(subject, FIRST_SHIPMENT_RANK);
    return reason === null ? { kind: "open" } : { kind: "refused", reason };
  }
}
