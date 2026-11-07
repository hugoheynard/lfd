import { Injectable } from "@nestjs/common";
import type { MailReceipt } from "@lfd/mailer";

import type { B2bMails } from "../../templates/mail-templates.js";
import { mailSpaceOf } from "../../templates/sections/mail-block-declarations.js";
import {
  type DeferrableMailTemplate,
  type DeferredMailDemand,
  type MailDemand,
  Mail,
} from "../../channels/requests/mail.js";
import { ImmediateMailSender } from "./immediate-mail-sender.service.js";
import { type CheckedMailDemand, MailRequester } from "./mail-requester.service.js";

/** Ce que les deux formes de demande ont en commun, une fois le type vérifié. */
interface TypedDemand {
  readonly template: keyof B2bMails;
  readonly to: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
  readonly replyTo?: string;
}

/**
 * La marque est l'espace du modèle (plan `plan-editeur-par-blocs.md`, § 25,
 * C3) : lue ici, une fois, et jamais fournie par l'appelant.
 */
function checked(demand: TypedDemand): CheckedMailDemand {
  return {
    template: demand.template,
    to: demand.to,
    data: demand.data,
    brand: mailSpaceOf(demand.template),
    idempotencyKey: demand.idempotencyKey,
    ...(demand.replyTo === undefined ? {} : { replyTo: demand.replyTo }),
  };
}

/**
 * Le bloc implémente sa propre porte : le type du modèle s'arrête ici, une
 * fois le compilateur passé chez l'appelant ; chaque geste a son service.
 */
@Injectable()
export class BlockMail extends Mail {
  constructor(
    private readonly requester: MailRequester,
    private readonly immediate: ImmediateMailSender,
  ) {
    super();
  }

  send<K extends DeferrableMailTemplate>(demand: DeferredMailDemand<K>): Promise<string> {
    return this.requester.request(checked(demand));
  }

  sendAndAwaitReceipt<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    return this.immediate.sendAndAwaitReceipt(checked(demand));
  }
}
