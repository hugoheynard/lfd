import type {
  MailRecipientSearchCreatedView,
  MailRecipientSearchView,
  MailRecipientView,
  MailSendDetailView,
  MailSendListView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { RevealMailRecipientCommand } from "../application/commands/reveal-mail-recipient.command.js";
import { SearchMailByRecipientCommand } from "../application/commands/search-mail-by-recipient.command.js";
import { GetMailSearchResultsQuery } from "../application/queries/get-mail-search-results.query.js";
import { GetMailRecipientQuery } from "../application/queries/get-mail-recipient.query.js";
import { GetMailSendQuery } from "../application/queries/get-mail-send.query.js";
import { ListMailSendsQuery } from "../application/queries/list-mail-sends.query.js";
import {
  type MailSearchPayload,
  mailSearchPayloadSchema,
  type MailSendsQueryParams,
  mailSendsQuerySchema,
} from "./mail-send-payloads.js";

function dateOrNull(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

/**
 * **Le suivi des e-mails** (`documentation/mail/le-suivi-des-e-mails.md`,
 * lot T2), sous le droit `mail_sends` — en LECTURE seule, révélation comprise :
 * révéler une adresse est une lecture tracée, pas une écriture du suivi.
 *
 * L'adresse est masquée partout, sauf `GET :id/recipient`, servi au seul
 * auteur d'une révélation de moins de 5 minutes.
 */
@Controller("admin/mail/sends")
@AdminSurface("mail_sends")
export class AdminMailSendsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Les envois, les problèmes d'abord ; la sonde avec `scope=probes`, seule. */
  @Get()
  list(
    @Query(new ZodQuery(mailSendsQuerySchema)) params: MailSendsQueryParams,
  ): Promise<MailSendListView> {
    return this.queries.execute<ListMailSendsQuery, MailSendListView>(
      new ListMailSendsQuery({
        space: params.space ?? null,
        template: params.template ?? null,
        state: params.state ?? null,
        delivery: params.delivery ?? null,
        refusal: params.refusal ?? null,
        from: dateOrNull(params.from),
        to: dateOrNull(params.to),
        scope: params.scope,
        cursor: params.cursor ?? null,
        limit: params.limit,
      }),
    );
  }

  /**
   * Cherche les envois d'une adresse, donnée dans le CORPS : inscrit au
   * journal, même plafond que les révélations (`409` au-delà). Rend
   * l'identifiant de la recherche. La clé d'intention de l'écran
   * (`Idempotency-Key`, obligatoire) fait qu'un double clic ne compte qu'une
   * consultation.
   */
  @Post("searches")
  @RequirePermission("mail_sends:read")
  async search(
    @Body(new ZodBody(mailSearchPayloadSchema)) payload: MailSearchPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<MailRecipientSearchCreatedView> {
    const id = await this.commands.execute<SearchMailByRecipientCommand, string>(
      new SearchMailByRecipientCommand(payload.address, staffUserId, intentKey),
    );
    return { id };
  }

  /** Les envois trouvés, figés à l'instant de la recherche ; `403` hors de son auteur ou après 5 minutes. */
  @Get("searches/:searchId")
  searchResults(
    @Param("searchId") searchId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<MailRecipientSearchView> {
    return this.queries.execute<GetMailSearchResultsQuery, MailRecipientSearchView>(
      new GetMailSearchResultsQuery(searchId, staffUserId),
    );
  }

  /** Un envoi : étapes, genre du retour, version du document — adresse masquée, sans raison d'échec. */
  @Get(":id")
  detail(@Param("id") id: string): Promise<MailSendDetailView> {
    return this.queries.execute<GetMailSendQuery, MailSendDetailView>(new GetMailSendQuery(id));
  }

  /**
   * Révèle l'adresse : inscrit au journal, vaut 5 minutes pour son auteur.
   * `409` au-delà de 30 consultations dans l'heure. Une fois par clé
   * d'intention (`Idempotency-Key`, obligatoire).
   */
  @Post(":id/recipient-reveal")
  @HttpCode(204)
  @RequirePermission("mail_sends:read")
  async reveal(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RevealMailRecipientCommand, void>(
      new RevealMailRecipientCommand(id, staffUserId, intentKey),
    );
  }

  /** L'adresse en clair et la raison d'un échec ; `403` nommé sans révélation en cours. */
  @Get(":id/recipient")
  recipient(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<MailRecipientView> {
    return this.queries.execute<GetMailRecipientQuery, MailRecipientView>(
      new GetMailRecipientQuery(id, staffUserId),
    );
  }
}
