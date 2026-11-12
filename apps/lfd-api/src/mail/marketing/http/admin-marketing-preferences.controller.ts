import type {
  MailPreferenceDetailView,
  MailPreferenceListView,
  MailPreferenceRecipientView,
  MailPreferenceSearchCreatedView,
  MailPreferenceSearchView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { RevealMarketingPreferenceRecipientCommand } from "../application/commands/reveal-marketing-preference-recipient.command.js";
import { UnsubscribeAddressByStaffCommand } from "../application/commands/unsubscribe-address-by-staff.command.js";
import { SearchMarketingPreferencesCommand } from "../application/commands/search-marketing-preferences.command.js";
import { GetMarketingPreferenceSearchQuery } from "../application/queries/get-marketing-preference-search.query.js";
import { UnsubscribeMarketingPreferenceCommand } from "../application/commands/unsubscribe-marketing-preference.command.js";
import { GetMarketingPreferenceRecipientQuery } from "../application/queries/get-marketing-preference-recipient.query.js";
import { GetMarketingPreferenceQuery } from "../application/queries/get-marketing-preference.query.js";
import { ListMarketingPreferencesQuery } from "../application/queries/list-marketing-preferences.query.js";
import {
  type MailPreferencesQueryParams,
  mailPreferencesQuerySchema,
  type PreferenceSearchPayload,
  preferenceSearchPayloadSchema,
  type StaffUnsubscribePayload,
  staffUnsubscribePayloadSchema,
} from "./admin-marketing-preference-payloads.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Les désinscriptions et accords**, vus par le staff (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règle 8, lot C4),
 * sous le droit `mail_sends` comme le suivi des envois.
 *
 * L'adresse est masquée partout, sauf `GET :id/recipient`, servi au seul
 * auteur d'une consultation de moins de 5 minutes. Le staff peut
 * DÉSINSCRIRE (source `staff`, fait au journal) — une écriture, donc
 * `mail_sends:write`, déduit du verbe ; les révélations restent des lectures ; **aucune route ne
 * réinscrit** — seul un nouvel accord du client le fait.
 */
@Controller("admin/mail/preferences")
@AdminSurface("mail_sends")
export class AdminMarketingPreferencesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Le registre, les lignes les plus récentes d'abord, par espace et par état. */
  @Get()
  list(
    @Query(new ZodQuery(mailPreferencesQuerySchema)) params: MailPreferencesQueryParams,
  ): Promise<MailPreferenceListView> {
    return this.queries.execute<ListMarketingPreferencesQuery, MailPreferenceListView>(
      new ListMarketingPreferencesQuery({
        space: params.space ?? null,
        status: params.status ?? null,
        cursor: params.cursor ?? null,
        limit: params.limit,
      }),
    );
  }

  /**
   * Désinscrit l'adresse donnée par le client (dans le CORPS) pour cet
   * espace. `204` quelle que soit l'adresse ; le geste est au journal.
   */
  @Post("unsubscriptions")
  @Idempotent(
    "transition : l'adresse ne se désinscrit qu'une fois ; rejouée, rien ne s'écrit au registre et le fait dit « changed: false » — chaque demande du client est tracée, voulu",
  )
  @HttpCode(204)
  async unsubscribeAddress(
    @Body(new ZodBody(staffUnsubscribePayloadSchema)) payload: StaffUnsubscribePayload,
  ): Promise<void> {
    await this.commands.execute<UnsubscribeAddressByStaffCommand, void>(
      new UnsubscribeAddressByStaffCommand(payload.space, payload.address),
    );
  }

  /**
   * Cherche les lignes d'une adresse, donnée dans le CORPS : inscrit au
   * journal, même plafond que les révélations (`409` au-delà). Rend
   * l'identifiant de la recherche. La clé d'intention de l'écran
   * (`Idempotency-Key`, obligatoire) fait qu'un double clic ne compte qu'une
   * consultation.
   */
  @Post("searches")
  @RequirePermission("mail_sends:read")
  async search(
    @Body(new ZodBody(preferenceSearchPayloadSchema)) payload: PreferenceSearchPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<MailPreferenceSearchCreatedView> {
    const id = await this.commands.execute<SearchMarketingPreferencesCommand, string>(
      new SearchMarketingPreferencesCommand(payload.address, staffUserId, intentKey),
    );
    return { id };
  }

  /** Les lignes trouvées, figées à l'instant de la recherche ; `403` hors de son auteur ou après 5 minutes. */
  @Get("searches/:searchId")
  searchResults(
    @Param("searchId") searchId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<MailPreferenceSearchView> {
    return this.queries.execute<GetMarketingPreferenceSearchQuery, MailPreferenceSearchView>(
      new GetMarketingPreferenceSearchQuery(searchId, staffUserId),
    );
  }

  /** Une ligne et la preuve de son accord — adresse masquée. */
  @Get(":id")
  detail(@Param("id") id: string): Promise<MailPreferenceDetailView> {
    return this.queries.execute<GetMarketingPreferenceQuery, MailPreferenceDetailView>(
      new GetMarketingPreferenceQuery(id),
    );
  }

  /** Désinscrit cette ligne à la demande du client ; idempotent. */
  @Post(":id/unsubscription")
  @Idempotent(
    "transition : la ligne ne se désinscrit qu'une fois ; rejouée, rien ne s'écrit et le fait dit « changed: false » — chaque demande du client est tracée, voulu",
  )
  @HttpCode(204)
  async unsubscribe(@Param("id") id: string): Promise<void> {
    await this.commands.execute<UnsubscribeMarketingPreferenceCommand, void>(
      new UnsubscribeMarketingPreferenceCommand(id),
    );
  }

  /**
   * Révèle l'adresse : inscrit au journal, vaut 5 minutes pour son auteur,
   * compte dans le plafond du suivi (`409` au-delà de 30 dans l'heure). Une
   * fois par clé d'intention (`Idempotency-Key`, obligatoire).
   */
  @Post(":id/recipient-reveal")
  @HttpCode(204)
  @RequirePermission("mail_sends:read")
  async reveal(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<RevealMarketingPreferenceRecipientCommand, void>(
      new RevealMarketingPreferenceRecipientCommand(id, staffUserId, intentKey),
    );
  }

  /** L'adresse en clair ; `403` nommé sans consultation en cours. */
  @Get(":id/recipient")
  recipient(
    @Param("id") id: string,
    @StaffUserId() staffUserId: string,
  ): Promise<MailPreferenceRecipientView> {
    return this.queries.execute<GetMarketingPreferenceRecipientQuery, MailPreferenceRecipientView>(
      new GetMarketingPreferenceRecipientQuery(id, staffUserId),
    );
  }
}
