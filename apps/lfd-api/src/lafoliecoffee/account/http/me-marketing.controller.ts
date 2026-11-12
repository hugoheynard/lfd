import {
  type MyMarketingPreferencesView,
  type PartnersConsentPayload,
  partnersConsentPayloadSchema,
  type SubscribeMarketingPayload,
  subscribeMarketingPayloadSchema,
  type UnsubscribeMarketingPayload,
  unsubscribeMarketingPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AcceptMarketingPartnersCommand } from "../application/commands/accept-marketing-partners.command.js";
import { SubscribeMyMarketingCommand } from "../application/commands/subscribe-my-marketing.command.js";
import { UnsubscribeMyMarketingCommand } from "../application/commands/unsubscribe-my-marketing.command.js";
import { GetMyMarketingPreferencesQuery } from "../application/queries/get-my-marketing-preferences.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **« Mes préférences » des e-mails d'offres** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, C2 et C3) — la
 * personne connectée, sous la garde du client.
 *
 * - `GET /me/marketing` → l'état de SON adresse par société, et `askable` :
 *   « faut-il montrer la case à la commande ? ». Aucune adresse n'est reçue
 *   du client : la réponse ne peut pas servir d'oracle (règle 17).
 * - `POST /me/marketing/subscriptions` → `204` s'inscrire, ou se réinscrire
 *   après une désinscription (seul ce geste le permet) ; double confirmation
 *   si l'adresse du compte n'est pas prouvée.
 * - `POST /me/marketing/unsubscriptions` → `204` se désinscrire.
 * - `POST /me/marketing/partners` → `204` la case « partenaires » ; `409`
 *   tant qu'elle n'est pas proposée (règle 19).
 *
 * Chaque écriture rend `204` : l'appelant relit `GET /me/marketing`.
 */
@Controller("me/marketing")
export class MeMarketingController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  preferences(@CurrentUser() user: Principal): Promise<MyMarketingPreferencesView> {
    return this.queries.execute<GetMyMarketingPreferencesQuery, MyMarketingPreferencesView>(
      new GetMyMarketingPreferencesQuery(user.email),
    );
  }

  @Post("subscriptions")
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(subscribeMarketingPayloadSchema)) payload: SubscribeMarketingPayload,
  ): Promise<void> {
    await this.commands.execute<SubscribeMyMarketingCommand, void>(
      new SubscribeMyMarketingCommand(
        user.userId,
        user.email,
        user.emailProven,
        payload.space,
        payload.textVersion,
        payload.locale,
      ),
    );
  }

  @Post("unsubscriptions")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "désinscrit l'adresse : rejouée, la préférence est déjà désinscrite et rien ne s'écrit",
  )
  async unsubscribe(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(unsubscribeMarketingPayloadSchema)) payload: UnsubscribeMarketingPayload,
  ): Promise<void> {
    await this.commands.execute<UnsubscribeMyMarketingCommand, void>(
      new UnsubscribeMyMarketingCommand(user.email, payload.space),
    );
  }

  @Post("partners")
  @HttpCode(HttpStatus.NO_CONTENT)
  async acceptPartners(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(partnersConsentPayloadSchema)) payload: PartnersConsentPayload,
  ): Promise<void> {
    await this.commands.execute<AcceptMarketingPartnersCommand, void>(
      new AcceptMarketingPartnersCommand(
        user.userId,
        user.email,
        user.emailProven,
        payload.textVersion,
        payload.locale,
      ),
    );
  }
}
