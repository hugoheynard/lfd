import type { Mailer, MailReceipt, SendMailArgs, TemplateMap } from "@lfd/mailer";

import {
  activeMailCopyOverlay,
  NO_MAIL_COPY_OVERLAY,
  withMailCopyOverlay,
  type MailCopyOverlay,
} from "../copy/mail-copy-overlay.js";
import type { PublishedMailCopyReader } from "./published-mail-copy.reader.js";

/** Ce que le mailer dit quand il se replie sur le texte du code. */
export interface EffectiveCopyLog {
  warn(message: string): void;
}

/**
 * Le mailer qui envoie le **texte effectif** de chaque e-mail : le texte du
 * code, remplacé par le texte publié s'il existe (plan
 * `plan-textes-des-e-mails.md`, C2, lot E2).
 *
 * 🔴 **Un e-mail part même si la lecture du publié échoue.** C'est la raison
 * de C2 : le code garde les textes par défaut, et une base qui ne répond pas
 * sur ce point fait partir l'e-mail d'avant l'écran — jamais aucun. Le repli
 * est dit dans le journal de l'API, pour qu'un texte publié qui ne part pas
 * se voie.
 *
 * Un périmètre déjà ouvert l'emporte : l'essai envoyé depuis l'écran
 * (« M'envoyer un essai », C6) choisit lui-même ses textes — les brouillons —,
 * et le publié ne doit pas les écraser.
 */
export class EffectiveCopyMailer<M extends TemplateMap> implements Mailer<M> {
  constructor(
    private readonly inner: Mailer<M>,
    private readonly published: PublishedMailCopyReader | null,
    private readonly log: EffectiveCopyLog,
  ) {}

  get enabled(): boolean {
    return this.inner.enabled;
  }

  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    if (activeMailCopyOverlay() !== undefined) {
      return this.inner.send(args);
    }
    const overlay = await this.publishedOrCode(String(args.template));
    return withMailCopyOverlay(overlay, () => this.inner.send(args));
  }

  private async publishedOrCode(template: string): Promise<MailCopyOverlay> {
    if (this.published === null) {
      return NO_MAIL_COPY_OVERLAY;
    }
    try {
      return await this.published.read();
    } catch (error: unknown) {
      this.log.warn(
        `Textes d'e-mails publiés illisibles : « ${template} » part avec le texte du code. Cause : ${String(error)}`,
      );
      return NO_MAIL_COPY_OVERLAY;
    }
  }
}
