import { Injectable } from "@nestjs/common";
import type { MailReceipt } from "@lfd/mailer";

import type { B2bMails } from "../../templates/mail-templates.js";
import {
  type DeferrableMailTemplate,
  type DeferredMailDemand,
  type MailDemand,
  MailRequests,
} from "../../channels/requests/mail-requests.js";
import { ImmediateMailSender } from "./immediate-mail-sender.service.js";
import { type CheckedMailDemand, MailRequester } from "./mail-requester.service.js";

/** Ce que les deux formes de demande ont en commun, une fois le type vérifié. */
interface TypedDemand {
  readonly template: string;
  readonly to: string;
  readonly data: unknown;
  readonly brand: string;
  readonly idempotencyKey: string;
  readonly replyTo?: string;
}

function checked(demand: TypedDemand): CheckedMailDemand {
  return {
    template: demand.template,
    to: demand.to,
    data: demand.data,
    brand: demand.brand,
    idempotencyKey: demand.idempotencyKey,
    ...(demand.replyTo === undefined ? {} : { replyTo: demand.replyTo }),
  };
}

/**
 * Le bloc implémente sa propre porte : le type du modèle s'arrête ici, une
 * fois le compilateur passé chez l'appelant ; chaque geste a son service.
 */
@Injectable()
export class BlockMailRequests extends MailRequests {
  constructor(
    private readonly requester: MailRequester,
    private readonly immediate: ImmediateMailSender,
  ) {
    super();
  }

  request<K extends DeferrableMailTemplate>(demand: DeferredMailDemand<K>): Promise<string> {
    return this.requester.request(checked(demand));
  }

  sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    return this.immediate.sendNow(checked(demand));
  }
}
