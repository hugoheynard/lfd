import type { Mailer, MailReceipt, SendMailArgs, TemplateMap } from "@lfd/mailer";

import { Clock } from "../../time/clock.js";
import { MailJournal } from "./mail-journal.port.js";

/**
 * Le mailer, **doublé d'un journal**.
 *
 * Un décorateur et non une modification du paquet : `@lfd/mailer` est partagé et
 * ne connaît ni Nest, ni Prisma, ni l'idée qu'une app tienne un registre. C'est
 * l'app qui décide de garder une trace, et c'est ici qu'elle le fait.
 *
 * L'écriture n'est **pas attendue** : le journal accompagne l'envoi, il ne le
 * conditionne pas. Une base lente ne doit pas retarder l'e-mail d'un client, et
 * un journal en panne ne doit pas empêcher une invitation de partir.
 */
export class JournalingMailer<M extends TemplateMap> implements Mailer<M> {
  constructor(
    private readonly inner: Mailer<M>,
    private readonly journal: MailJournal,
    private readonly clock: Clock,
  ) {}

  get enabled(): boolean {
    return this.inner.enabled;
  }

  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    const receipt = await this.inner.send(args);
    void this.journal.recordSend({
      providerId: receipt.providerId,
      template: String(args.template),
      recipient: args.to,
      at: this.clock.now(),
    });
    return receipt;
  }
}
