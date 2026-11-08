import { type NewsletterSignupPayload, newsletterSignupPayloadSchema } from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SubscribeNewsletterCommand } from "../application/commands/subscribe-newsletter.command.js";
import { NewsletterAddressThrottleGuard } from "./newsletter-address-throttle.guard.js";

/** Par IP : de quoi s'inscrire et se reprendre, pas de quoi balayer des adresses. */
const REQUESTS_PER_IP = 10;
const MINUTE_MS = 60_000;

/**
 * **La lettre d'information du pied de page de la boutique** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, C5). Surface
 * PUBLIQUE, atteinte par la passerelle sous `/api/lfd`.
 *
 * `POST /mail/newsletter` → `202` sans corps, TOUJOURS : adresse inconnue,
 * déjà inscrite, en attente, désinscrite, ou champ piège rempli — « si cette
 * adresse peut recevoir nos nouvelles, un e-mail de confirmation vient de
 * partir ». L'adresse est dans le corps, jamais dans l'URL. Débit par IP ET
 * par adresse (empreinte).
 */
@Controller("mail/newsletter")
@Public()
export class NewsletterController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: REQUESTS_PER_IP, ttl: MINUTE_MS } })
  @UseGuards(NewsletterAddressThrottleGuard)
  async subscribe(
    @Body(new ZodBody(newsletterSignupPayloadSchema)) payload: NewsletterSignupPayload,
  ): Promise<void> {
    await this.commands.execute<SubscribeNewsletterCommand, void>(
      new SubscribeNewsletterCommand(
        payload.email,
        payload.textVersion,
        payload.locale,
        payload.website ?? "",
      ),
    );
  }
}
