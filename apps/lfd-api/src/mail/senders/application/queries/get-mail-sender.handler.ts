import {
  senderHeaderOf,
  type MailNature,
  type MailSenderDefaultView,
  type MailSenderView,
  type MailSpace,
} from "@lfd/mail-blocks";
import { Logger } from "@nestjs/common";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { mailSpaceOfParam } from "../../../charters/application/mail-space-param.js";
import { MailSpaceSender } from "../../domain/mail-space-sender.js";
import { MailSenderReader } from "../../domain/ports/mail-sender.reader.js";
import { VerifiedSendingDomains } from "../../domain/ports/verified-sending-domains.js";
import { mailNatureOfParam } from "../mail-nature-param.js";
import { GetMailSenderQuery } from "./get-mail-sender.query.js";

/**
 * Ouvre l'identité d'envoi d'un espace (plan `plan-editeur-par-blocs.md`,
 * § 25, C3) : la sienne, ou rien — il envoie alors sous l'identité par
 * défaut de la configuration, que la vue porte toujours pour que l'écran le
 * dise. Les domaines vérifiés chez Resend guident la saisie ; une liste
 * illisible n'empêche pas d'ouvrir la page (`null`), l'enregistrement le
 * dira. Rien n'est écrit.
 *
 * **Par nature** (lot U5) : le repli d'une identité marketing pas encore
 * réglée est l'identité TRANSACTIONNELLE de l'espace — c'est d'elle que
 * partent alors ses e-mails marketing, et l'écran le dit (« pas encore
 * réglée : part de l'adresse transactionnelle ») ; sans transactionnelle
 * non plus, la configuration.
 */
@QueryHandler(GetMailSenderQuery)
export class GetMailSenderHandler implements IQueryHandler<GetMailSenderQuery, MailSenderView> {
  private readonly log = new Logger("MailSenders");

  constructor(
    private readonly reader: MailSenderReader,
    private readonly domains: VerifiedSendingDomains,
    private readonly config: AppConfig,
  ) {}

  /**
   * @throws {UnknownMailSpaceError} l'espace n'existe pas.
   * @throws {UnknownMailNatureError} la nature n'existe pas.
   * @throws {MailSenderNatureNotOfferedError} l'espace ne règle pas cette nature.
   * @throws {StoredMailSenderUnreadableError} l'identité rangée ne tient plus.
   */
  async execute(query: GetMailSenderQuery): Promise<MailSenderView> {
    const space = mailSpaceOfParam(query.space);
    const nature = mailNatureOfParam(query.nature);
    const { identity, changed, revision } = (await this.senderOf(space, nature)).snapshot();
    return {
      space,
      nature,
      identity,
      fallback: await this.fallbackOf(space, nature),
      revision,
      changed: changed === null ? null : { at: changed.at.toISOString(), staffId: changed.staffId },
      verifiedDomains: await this.verifiedOrNull(),
    };
  }

  private async senderOf(space: MailSpace, nature: MailNature): Promise<MailSpaceSender> {
    const state = await this.reader.stateOf(space, nature);
    return state === null
      ? MailSpaceSender.unset(space, nature)
      : MailSpaceSender.reconstitute(state);
  }

  private async fallbackOf(space: MailSpace, nature: MailNature): Promise<MailSenderDefaultView> {
    if (nature === "marketing") {
      const transactional = (await this.senderOf(space, "transactional")).snapshot().identity;
      if (transactional !== null) {
        return {
          fromAddress: senderHeaderOf(transactional),
          replyToAddress: transactional.replyToAddress ?? transactional.fromAddress,
          source: "transactional",
        };
      }
    }
    const mailer = this.config.mailerConfig();
    return {
      fromAddress: mailer.fromAddress,
      replyToAddress: mailer.replyTo,
      source: "configuration",
    };
  }

  private async verifiedOrNull(): Promise<readonly string[] | null> {
    try {
      return await this.domains.verified();
    } catch (error: unknown) {
      // Lecture d'aide seulement : l'enregistrement relit la liste et refuse nommément.
      this.log.warn(
        `Domaines vérifiés chez Resend illisibles : la page de l'identité d'envoi s'ouvre sans eux. Cause : ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
