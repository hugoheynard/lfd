import type { Mailer, MailReceipt, SendMailArgs, TemplateMap } from "@lfd/mailer";

import { BackgroundWork } from "../../events/background-work.js";
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
    private readonly work: BackgroundWork,
  ) {}

  get enabled(): boolean {
    return this.inner.enabled;
  }

  /**
   * Envoie, puis journalise **sans faire attendre l'appelant**.
   *
   * 🔴 L'écriture était un `void` nu. Elle n'était donc ni attendue, ni
   * attrapée, ni **connue de personne** — trois conséquences, et la troisième
   * est la pire :
   *
   * - son échec devenait un `unhandledRejection` ;
   * - le processus pouvait s'arrêter entre l'envoi et l'écriture, et le
   *   `providerId` était alors perdu. Or c'est la SEULE clé qui relie un envoi
   *   aux événements qui le suivront : un webhook Resend arrivait ensuite sur
   *   une ligne qui n'existait pas, et le journal devenait muet exactement là
   *   où il existe pour parler ;
   * - aucun test ne pouvait l'attendre, donc aucun ne pouvait affirmer qu'un
   *   courriel était parti. C'est ce qui l'a fait découvrir.
   *
   * `track` répare les trois d'un coup : l'échec est journalisé, la tâche est
   * comptée, et `whenIdle()` donne le point d'attente qui manquait. L'appelant,
   * lui, n'attend toujours pas — un envoi ne doit pas dépendre d'une écriture
   * annexe.
   */
  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    const receipt = await this.inner.send(args);
    void this.work.track(
      this.journal.recordSend({
        providerId: receipt.providerId,
        template: String(args.template),
        recipient: args.to,
        at: this.clock.now(),
      }),
      "mail-journal-record",
    );
    return receipt;
  }
}
