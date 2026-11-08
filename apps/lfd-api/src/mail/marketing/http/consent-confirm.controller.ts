import {
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { perParamThrottleGuard } from "../../../platform/security/per-param-throttle.guard.js";
import { ConfirmConsentByTokenCommand } from "../application/commands/confirm-consent-by-token.command.js";
import { consentConfirmedPage, consentConfirmPage } from "./consent-confirm-page.js";
import { UNSUBSCRIBE_PAGE_CSP, pageLocaleOf } from "./unsubscribe-page.js";

/** La page et le geste, par IP : de quoi suivre un lien, pas de quoi balayer des jetons. */
const REQUESTS_PER_IP = 20;
/** Un même jeton : quelques POST par minute. */
const POSTS_PER_TOKEN = 5;
const MINUTE_MS = 60_000;

/**
 * **La confirmation d'un accord par le lien de l'e-mail** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 18, C1).
 * Surface PUBLIQUE, atteinte par la passerelle sous `/api/lfd` — les mêmes
 * règles que la désinscription :
 *
 * - `GET /mail/marketing/confirm/:token` → `200` une page NEUTRE, la même
 *   pour tout jeton, qui ne lit pas le jeton et ne confirme JAMAIS : les
 *   antivirus de messagerie ouvrent les liens.
 * - `POST /mail/marketing/confirm/:token` → `200` la même page de fin pour
 *   tout jeton — valide, expiré, rejoué, altéré. Le bouton de la page, seul :
 *   aucune messagerie n'y poste, il reste donc sous le seau par IP, et un
 *   même jeton est borné à part.
 *
 * `private, no-store`, `noindex`, `Referrer-Policy: no-referrer` (le jeton
 * est dans l'URL) et une CSP `default-src 'none'`. Le jeton n'est jamais
 * journalisé, et aucune adresse n'est dans l'URL.
 */
@Controller("mail/marketing/confirm")
@Public()
export class ConsentConfirmController {
  constructor(private readonly commands: CommandBus) {}

  @Get(":token")
  @Throttle({ default: { limit: REQUESTS_PER_IP, ttl: MINUTE_MS } })
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", UNSUBSCRIBE_PAGE_CSP)
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  page(@Headers("accept-language") acceptLanguage: string | undefined): string {
    return consentConfirmPage(pageLocaleOf(acceptLanguage));
  }

  @Post(":token")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: REQUESTS_PER_IP, ttl: MINUTE_MS } })
  @UseGuards(
    perParamThrottleGuard({
      name: "mail-marketing-confirm",
      param: "token",
      limit: POSTS_PER_TOKEN,
      windowMs: MINUTE_MS,
    }),
  )
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", UNSUBSCRIBE_PAGE_CSP)
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  async confirm(
    @Param("token") token: string,
    @Headers("accept-language") acceptLanguage: string | undefined,
  ): Promise<string> {
    await this.commands.execute<ConfirmConsentByTokenCommand, void>(
      new ConfirmConsentByTokenCommand(token),
    );
    return consentConfirmedPage(pageLocaleOf(acceptLanguage));
  }
}
