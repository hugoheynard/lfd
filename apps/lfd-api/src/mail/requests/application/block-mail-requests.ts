import { Injectable } from "@nestjs/common";
import type { MailReceipt } from "@lfd/mailer";

import type { B2bMails } from "../../../platform/mailer/mail-templates.js";
import {
  type DeferrableMailTemplate,
  type MailDemand,
  MailRequests,
} from "../../channels/requests/mail-requests.js";
import { ImmediateMailSender } from "./immediate-mail-sender.service.js";
import { type CheckedMailDemand, MailRequester } from "./mail-requester.service.js";

function checked<K extends keyof B2bMails>(demand: MailDemand<K>): CheckedMailDemand {
  return {
    template: demand.template,
    to: demand.to,
    data: demand.data,
    brand: demand.brand,
    idempotencyKey: demand.idempotencyKey,
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

  request<K extends DeferrableMailTemplate>(demand: MailDemand<K>): Promise<void> {
    return this.requester.request(checked(demand));
  }

  sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    return this.immediate.sendNow(checked(demand));
  }
}
