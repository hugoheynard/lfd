import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";

import { Public } from "../../auth/public.decorator.js";
import { AppConfig } from "../../config/app-config.js";
import { Clock } from "../../time/clock.js";
import { MailJournal } from "../journal/mail-journal.port.js";
import { readResendEvent } from "./resend-event.js";
import { verifySvixSignature } from "./svix-signature.js";

/** Le fournisseur, tel qu'inscrit au registre des messages déjà vus. */
const PROVIDER = "resend";

/**
 * Réception des **webhooks Resend** — ce que devient un e-mail après son envoi.
 *
 * Route **publique** (Resend n'a pas de jeton Auth0) mais **authentifiée par
 * signature** : sans preuve d'origine, n'importe qui pourrait déclarer que les
 * e-mails d'un concurrent rebondissent. Le corps doit être le **payload brut** —
 * Svix signe les octets exacts, un JSON re-sérialisé casserait la signature.
 *
 * Le code de retour dit à Resend quoi faire, et c'est une décision, pas un
 * détail : un `2xx` arrête les reprises, un `5xx` les relance. On ne rend donc
 * `5xx` **jamais** — même un événement illisible est acquitté, parce qu'aucune
 * reprise ne le rendra lisible.
 */
@Controller("webhooks/resend")
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly journal: MailJournal,
    private readonly clock: Clock,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") timestamp: string | undefined,
    @Headers("svix-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    const body = request.rawBody?.toString("utf8") ?? "";
    const verdict = verifySvixSignature({
      secret: this.config.mailerConfig().webhookSecret,
      headers: { id, timestamp, signature },
      body,
      nowMs: this.clock.now().getTime(),
    });
    if (verdict !== "ok") {
      // Le motif reste dans le journal, jamais dans la réponse : le dire à
      // l'appelant lui apprendrait à s'approcher.
      this.logger.warn(`Webhook Resend refusé (${verdict})`);
      throw new UnauthorizedException();
    }
    await this.consume(id ?? "", body);
    return { received: true };
  }

  /** Traite un message **prouvé nôtre**, une seule fois. */
  private async consume(externalId: string, body: string): Promise<void> {
    if (!(await this.journal.rememberEvent(PROVIDER, externalId))) {
      // Svix réessaie : le traiter deux fois compterait deux rebonds pour un.
      return;
    }
    const event = readResendEvent(parse(body));
    if (event === null) {
      return;
    }
    await this.journal.recordOutcome({
      providerId: event.providerId,
      status: event.status,
      detail: event.detail,
      at: this.clock.now(),
    });
  }
}

/** Un JSON illisible n'est pas une panne : c'est un message qu'on ignore. */
function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
