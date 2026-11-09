import type { MailSenderPayload, MailSenderView } from "@lfd/mail-blocks";
import { Body, Controller, Get, HttpCode, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ChangeMailSenderCommand } from "../application/commands/change-mail-sender.command.js";
import { GetMailSenderQuery } from "../application/queries/get-mail-sender.query.js";
import { mailSenderPayloadSchema } from "./mail-sender-payloads.js";

/**
 * **L'identité d'envoi d'un espace d'e-mails** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3), sous le droit des e-mails,
 * `mail_templates` : `read` pour la lire, `write` pour la changer — le
 * contrôle du domaine vérifié empêche d'écrire au nom d'un domaine qui n'est
 * pas à nous. `:space` vaut `lfc` ou `lfd` ; un autre espace est un 404 nommé.
 *
 * `:nature` (lot U5 du plan `plan-desinscription-des-e-mails.md`) vaut
 * `transactional` ou `marketing` ; `lfd` n'a pas d'identité marketing (404
 * nommé). Les routes sans `:nature` restent celles de l'identité
 * transactionnelle.
 */
/** La nature des routes sans `:nature`, servies avant le lot U5. */
const TRANSACTIONAL = "transactional";

@Controller("admin/mail-senders")
@AdminSurface("mail_templates")
export class AdminMailSendersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** L'identité de l'espace (ou aucune), celle par défaut, et les domaines vérifiés chez Resend. */
  @Get(":space")
  read(@Param("space") space: string): Promise<MailSenderView> {
    return this.readOfNature(space, TRANSACTIONAL);
  }

  /** L'identité de l'espace pour cette nature, son repli, et les domaines vérifiés. */
  @Get(":space/:nature")
  readOfNature(
    @Param("space") space: string,
    @Param("nature") nature: string,
  ): Promise<MailSenderView> {
    return this.queries.execute<GetMailSenderQuery, MailSenderView>(
      new GetMailSenderQuery(space, nature),
    );
  }

  /**
   * Change l'identité : un essai part vers l'auteur sous elle, puis elle est
   * enregistrée. En-tête `Idempotency-Key` obligatoire ; `409` si le domaine
   * n'est pas vérifié, si l'essai n'est pas parti, ou si quelqu'un a écrit
   * entre-temps.
   */
  @Put(":space")
  @HttpCode(204)
  async change(
    @Param("space") space: string,
    @Body(new ZodBody(mailSenderPayloadSchema)) payload: MailSenderPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.changeOfNature(space, TRANSACTIONAL, payload, staffUserId, intentKey);
  }

  /** Change l'identité de l'espace pour cette nature — mêmes règles, même essai. */
  @Put(":space/:nature")
  @HttpCode(204)
  async changeOfNature(
    @Param("space") space: string,
    @Param("nature") nature: string,
    @Body(new ZodBody(mailSenderPayloadSchema)) payload: MailSenderPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<ChangeMailSenderCommand, void>(
      new ChangeMailSenderCommand(
        space,
        nature,
        payload.identity,
        payload.expectedRevision,
        staffUserId,
        intentKey,
      ),
    );
  }
}
