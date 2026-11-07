import { senderHeaderOf, type MailSenderIdentity } from "@lfd/mail-blocks";
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
import { activeMailCharter, withMailCharter } from "../sections/mail-charter-scope.js";
import { activeMailSender } from "../sections/mail-sender-scope.js";
import { documentLocaleOf } from "../sections/mail-document-locale.js";
import { mailSpaceOf } from "../sections/mail-block-declarations.js";
import { MAIL_LAYOUTS } from "../sections/mail-layouts.js";
import type { B2bMails } from "../mail-templates.js";
import { resolvePublishedMailCharter } from "./published-mail-charter-resolution.js";
import { noteComposingDocument } from "./mail-composition.js";
import type { PublishedMailCopyReader } from "./published-mail-copy.reader.js";
import type { PublishedMailDocumentEntry } from "./published-mail-documents.js";

function isRegisteredMail(mail: string): mail is keyof B2bMails {
  return Object.hasOwn(MAIL_LAYOUTS, mail);
}

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
 *
 * La charte publiée de l'espace de l'e-mail (plan `plan-editeur-par-blocs.md`,
 * § 25, C1) s'applique au rendu, dans la langue de l'envoi ; sans charte
 * publiée — ou si elle est illisible, ce que le journal dit —, la charte de
 * départ, à l'octet. Un essai qui a déjà ouvert sa mise en page la reçoit
 * aussi : seul un périmètre de charte déjà ouvert (l'aperçu de la charte)
 * l'emporte.
 *
 * L'identité d'envoi de l'espace (C3) donne l'expéditeur et l'adresse de
 * réponse — celle du message l'emporte ; sans identité rangée, ou si elle
 * est illisible (le journal le dit), l'identité par défaut du mailer. Un
 * périmètre d'identité ouvert (l'essai, la sonde) l'emporte sur l'espace.
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
    const charter =
      activeMailCharter() === undefined
        ? await resolvePublishedMailCharter(this.published, template, args.data, this.log)
        : undefined;
    const sender = activeMailSender() ?? (await this.senderOrDefault(template));
    const sent = sender === null ? args : withSender(args, sender);
    const send = (): Promise<MailReceipt> =>
      charter === undefined
        ? this.inner.send(sent)
        : withMailCharter(charter, () => this.inner.send(sent));
    const withLayout = (): Promise<MailReceipt> =>
      layout === null ? send() : withMailLayout(layout, send);
    return overlay === null ? withLayout() : withMailCopyOverlay(overlay, withLayout);
  }

  private async senderOrDefault(template: string): Promise<MailSenderIdentity | null> {
    if (this.published === null || !isRegisteredMail(template)) {
      return null;
    }
    const space = mailSpaceOf(template);
    try {
      const entry = (await this.published.senders())[space];
      if (entry?.kind === "unreadable") {
        this.log.warn(
          `Identité d'envoi de l'espace « ${space} » illisible par ce code : « ${template} » part sous l'identité par défaut.`,
        );
        return null;
      }
      return entry?.identity ?? null;
    } catch (error: unknown) {
      this.log.warn(
        `Identités d'envoi illisibles : « ${template} » part sous l'identité par défaut. Cause : ${String(error)}`,
      );
      return null;
    }
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

/**
 * L'envoi sous une identité : son en-tête `From:`, et sa réponse — celle du
 * message d'abord, sinon celle de l'identité, sinon l'adresse d'envoi
 * elle-même (jamais l'adresse de réponse de la configuration, qui est celle
 * d'une autre identité).
 */
function withSender<M extends TemplateMap, K extends keyof M>(
  args: SendMailArgs<M, K>,
  sender: MailSenderIdentity,
): SendMailArgs<M, K> {
  return {
    ...args,
    from: senderHeaderOf(sender),
    replyTo: args.replyTo ?? sender.replyToAddress ?? sender.fromAddress,
  };
}
