import {
  Body,
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
import { SkipThrottle, Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { perParamThrottleGuard } from "../../../platform/security/per-param-throttle.guard.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UnsubscribeByTokenCommand } from "../application/commands/unsubscribe-by-token.command.js";
import { groupIsOffered } from "../domain/services/marketing-group.js";
import { type UnsubscribeForm, unsubscribeFormSchema } from "./unsubscribe-form.js";
import { UNSUBSCRIBE_PAGE_CSP, confirmPage, donePage, pageLocaleOf } from "./unsubscribe-page.js";

/** Un même jeton : quelques POST par minute (contradiction B1). */
const POSTS_PER_TOKEN = 5;
/** La page, par IP : de quoi suivre un lien, pas de quoi balayer des jetons. */
const PAGES_PER_IP = 20;
const MINUTE_MS = 60_000;

/**
 * **La désinscription par le lien d'un e-mail** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règles 3 à 5 et
 * la contradiction de vitruve). Surface PUBLIQUE, atteinte par la passerelle
 * sous `/api/lfd`.
 *
 * - `GET /mail/unsubscribe/:token` → `200` une page NEUTRE (sans charte ni
 *   nom d'espace), la même pour tout jeton, qui ne lit pas le jeton et ne
 *   désinscrit JAMAIS : les antivirus de messagerie ouvrent les liens.
 * - `POST /mail/unsubscribe/:token` → `200` la même page de fin pour tout
 *   jeton — valide, altéré, déjà utilisé. Le bouton de la page et le
 *   « One-Click » de Gmail (RFC 8058). Exempté du seau par IP, borné par
 *   jeton.
 *
 * `private, no-store`, `noindex`, `Referrer-Policy: no-referrer` (le jeton
 * est dans l'URL) et une CSP `default-src 'none'`. Le jeton n'est jamais
 * journalisé.
 */
@Controller("mail/unsubscribe")
@Public()
export class UnsubscribeController {
  constructor(private readonly commands: CommandBus) {}

  @Get(":token")
  @Throttle({ default: { limit: PAGES_PER_IP, ttl: MINUTE_MS } })
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", UNSUBSCRIBE_PAGE_CSP)
  @Header("X-Robots-Tag", "noindex")
  @Header("Referrer-Policy", "no-referrer")
  page(@Headers("accept-language") acceptLanguage: string | undefined): string {
    return confirmPage(pageLocaleOf(acceptLanguage), groupIsOffered());
  }

  @Post(":token")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @UseGuards(
    perParamThrottleGuard({
      name: "mail-unsubscribe",
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
  async unsubscribe(
    @Param("token") token: string,
    @Body(new ZodBody(unsubscribeFormSchema)) form: UnsubscribeForm,
    @Headers("accept-language") acceptLanguage: string | undefined,
  ): Promise<string> {
    await this.commands.execute<UnsubscribeByTokenCommand, void>(
      new UnsubscribeByTokenCommand(token, form.oneClick, form.wholeGroup),
    );
    return donePage(pageLocaleOf(acceptLanguage));
  }
}
