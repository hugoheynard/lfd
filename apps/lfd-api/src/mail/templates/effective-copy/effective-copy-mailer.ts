import type { Mailer, MailReceipt, SendMailArgs, TemplateMap } from "@lfd/mailer";

import {
  activeMailCopyOverlay,
  NO_MAIL_COPY_OVERLAY,
  withMailCopyOverlay,
  type MailCopyOverlay,
} from "../copy/mail-copy-overlay.js";
import {
  activeMailLayout,
  NO_MAIL_LAYOUT,
  withMailLayout,
  type MailLayoutScope,
} from "../sections/mail-layout-scope.js";
import { documentLocaleOf } from "../sections/mail-document-locale.js";
import { noteComposingDocument } from "./mail-composition.js";
import type { PublishedMailCopyReader } from "./published-mail-copy.reader.js";
import type { PublishedMailDocumentEntry } from "./published-mail-documents.js";

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
 *
 * L'ordre des sections (E4, S3) suit la même règle, lu à part : un ordre
 * illisible fait partir l'e-mail dans l'ordre du code, avec ses textes publiés.
 *
 * Le document publié de l'éditeur par blocs (plan `plan-editeur-par-blocs.md`,
 * S4c) prime sur l'ordre publié du même e-mail : document publié, sinon ordre
 * publié de l'ancienne table, sinon ordre du code. Un document illisible —
 * ou une lecture qui échoue — fait partir l'e-mail dans l'ordre du CODE (§ 11),
 * et le journal le dit. La version qui compose l'envoi est notée
 * (`noteComposingDocument`) pour que la demande la garde.
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
    const template = String(args.template);
    const overlay =
      activeMailCopyOverlay() === undefined ? await this.publishedOrCode(template) : null;
    const layout =
      activeMailLayout() === undefined ? await this.layoutOrCode(template, args.data) : null;
    const withLayout = (): Promise<MailReceipt> =>
      layout === null ? this.inner.send(args) : withMailLayout(layout, () => this.inner.send(args));
    return overlay === null ? withLayout() : withMailCopyOverlay(overlay, withLayout);
  }

  private async layoutOrCode(template: string, data: unknown): Promise<MailLayoutScope> {
    if (this.published === null) {
      return NO_MAIL_LAYOUT;
    }
    let orders: MailLayoutScope["orders"];
    let entry: PublishedMailDocumentEntry | undefined;
    try {
      orders = await this.published.sectionOrders();
      entry = (await this.published.documents())[template];
    } catch (error: unknown) {
      this.log.warn(
        `Ordre des sections ou document d'e-mail publié illisible : « ${template} » part dans l'ordre du code. Cause : ${String(error)}`,
      );
      return NO_MAIL_LAYOUT;
    }
    if (entry === undefined) {
      return { orders, markers: false };
    }
    if (entry.kind === "unreadable") {
      this.log.warn(
        `Document publié v${entry.version} de « ${template} » illisible par ce code (${entry.reason}) : l'e-mail part dans l'ordre du code.`,
      );
      return NO_MAIL_LAYOUT;
    }
    noteComposingDocument(entry.version);
    return {
      orders,
      markers: false,
      documents: {
        [template]: { document: entry.document, locale: documentLocaleOf(template, data) },
      },
    };
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
