import type { MailReceipt } from "@lfd/mailer";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { B2bMails } from "../../templates/b2b-mails.js";
import {
  type DeferrableMailTemplate,
  type DeferredMailDemand,
  type MailDemand,
  Mail,
} from "../mail.js";

/** Une demande telle que le double l'a reçue. */
export interface RecordedMail {
  readonly template: string;
  readonly to: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
}

/**
 * Une unité de travail sans transaction qui sait si elle est OUVERTE — ce que
 * la porte du bloc vérifie (`send` dedans, `sendAndAwaitReceipt` dehors).
 */
export class OpenableUnitOfWork extends UnitOfWork {
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    const outer = this.open;
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = outer;
    }
  }
}

/** La faute que la vraie porte lève : la demande et l'écriture ne tomberaient pas ensemble. */
export class MisplacedMailRequestError extends TypeError {}

/**
 * **La porte du bloc `mail`, doublée** pour les tests d'un bloc qui demande
 * des e-mails (plan S2) : elle range ce qu'on lui demande, geste par geste,
 * sans rien envoyer. `failWith` fait échouer le prochain appel, quel qu'il
 * soit.
 *
 * Donnée une {@link OpenableUnitOfWork}, elle tient la règle de la vraie
 * porte : `send` refusé hors d'une unité de travail, `sendAndAwaitReceipt` refusé
 * dedans. Sans, elle ne vérifie rien (un abonné durable est TOUJOURS appelé
 * dans la transaction de sa livraison, que son test ne joue pas).
 *
 * Un bloc métier ne double plus le mailer : il ne le connaît plus.
 */
export class RecordingMail extends Mail {
  readonly queued: RecordedMail[] = [];
  readonly awaitedReceipt: RecordedMail[] = [];
  failWith: Error | null = null;

  constructor(private readonly unitOfWork: OpenableUnitOfWork | null = null) {
    super();
  }

  send<K extends DeferrableMailTemplate>(demand: DeferredMailDemand<K>): Promise<string> {
    if (this.unitOfWork !== null && !this.unitOfWork.open) {
      return Promise.reject(
        new MisplacedMailRequestError(`request hors transaction (${demand.template})`),
      );
    }
    const failure = this.takeFailure();
    if (failure !== null) {
      return Promise.reject(failure);
    }
    this.queued.push(demand);
    return Promise.resolve(`mail_${this.queued.length}`);
  }

  sendAndAwaitReceipt<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt> {
    if (this.unitOfWork?.open === true) {
      return Promise.reject(
        new MisplacedMailRequestError(
          `sendAndAwaitReceipt dans une transaction (${demand.template})`,
        ),
      );
    }
    const failure = this.takeFailure();
    if (failure !== null) {
      return Promise.reject(failure);
    }
    this.awaitedReceipt.push(demand);
    return Promise.resolve({ providerId: `re_${this.awaitedReceipt.length}` });
  }

  private takeFailure(): Error | null {
    const failure = this.failWith;
    this.failWith = null;
    return failure;
  }
}
