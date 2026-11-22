import {
  type PayLinkIntent,
  type PayLinkTokenPayload,
  payLinkTokenPayloadSchema,
  type PayLinkView,
} from "@lfd/contracts";
import { Body, Controller, Header, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { StartPayLinkPaymentCommand } from "../application/commands/start-pay-link-payment.command.js";
import type { PayLinkPaymentStart } from "../application/commands/start-pay-link-payment.handler.js";
import { ViewPayLinkQuery } from "../application/queries/view-pay-link.query.js";
import type { SubjectQuote } from "../../channels/subjects/linkable-subject.js";

/**
 * **La page publique d'un lien de paiement** (plan
 * `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
 * §2.3) — sans compte : le jeton du lien est la seule clé.
 *
 * Le jeton voyage dans le CORPS de deux `POST`, jamais dans un chemin de
 * l'API (journaux, `Referer`, scanners de liens). Débit par route et par IP.
 *
 * - `POST view` `{ token }` → `200` `PayLinkView` ; `404` neutre pour un jeton
 *   inconnu ou un lien révoqué, sans distinguer les deux.
 * - `POST intent` `{ token }` → `200` `PayLinkIntent` ; même `404` ; `409`
 *   quand le sujet n'est plus dû, ou que son intention est close.
 *
 * `no-store`, `noindex` et `Referrer-Policy: no-referrer` sur les deux.
 */
@Controller("pay-links")
@Public()
export class PayLinksController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post("view")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  @Idempotent(
    "lecture en POST (le jeton voyage dans le corps) : rend ce que le sujet montre, n'écrit rien et n'appelle personne",
  )
  async view(
    @Body(new ZodBody(payLinkTokenPayloadSchema)) payload: PayLinkTokenPayload,
  ): Promise<PayLinkView> {
    return this.queries.execute<ViewPayLinkQuery, SubjectQuote>(
      new ViewPayLinkQuery(payload.token),
    );
  }

  @Post("intent")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  @Idempotent(
    "route publique sans acteur (pas de clé d'intention possible) ; l'index payment_first_per_subject_key n'admet qu'un premier paiement par sujet : rejouée, la route relit l'intention existante, et une intention créée par une course perdue est annulée",
  )
  async intent(
    @Body(new ZodBody(payLinkTokenPayloadSchema)) payload: PayLinkTokenPayload,
  ): Promise<PayLinkIntent> {
    return this.commands.execute<StartPayLinkPaymentCommand, PayLinkPaymentStart>(
      new StartPayLinkPaymentCommand(payload.token),
    );
  }
}
