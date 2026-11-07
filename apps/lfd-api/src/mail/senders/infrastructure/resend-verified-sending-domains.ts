import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { AppConfig } from "../../../platform/config/app-config.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import { SendingDomainsUnavailableError } from "../domain/mail-sender-errors.js";
import { VerifiedSendingDomains } from "../domain/ports/verified-sending-domains.js";

/** L'adresse de la liste des domaines dans l'API Resend (`GET /domains`). */
export const RESEND_DOMAINS_URL = "https://api.resend.com/domains";

/** Au-delà, on renonce : l'enregistrement dira que Resend ne répond pas. */
const TIMEOUT_MS = 10_000;

/** Les statuts par lesquels Resend dit qu'une clé ne peut pas lire les domaines. */
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

/** La part de la réponse qu'on lit : le nom et l'état de chaque domaine. */
const domainsResponse = z.object({
  data: z.array(z.object({ name: z.string().min(1), status: z.string() })),
});

/**
 * **Les domaines vérifiés, lus chez Resend** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) — par `fetch` : le SDK que porte
 * `@lfd/mailer` n'expose que l'envoi, et la lecture ne se fait qu'au geste
 * d'enregistrement (et à l'ouverture de la page), jamais à l'envoi.
 *
 * Seuls les domaines `verified` comptent : un domaine `pending` ou `failed`
 * ferait refuser chaque envoi. Sans clé (mode à blanc), la liste ne peut
 * pas être lue — on ne l'invente pas.
 */
@Injectable()
export class ResendVerifiedSendingDomains extends VerifiedSendingDomains {
  constructor(private readonly config: AppConfig) {
    super();
  }

  async verified(): Promise<readonly string[]> {
    const apiKey = this.config.mailerConfig().apiKey;
    if (apiKey === null) {
      throw new SendingDomainsUnavailableError(
        "aucune clé Resend n'est configurée sur ce serveur (les e-mails y partent à blanc).",
      );
    }
    assertOutsideTransaction("mail.sender.verified-domains");
    const response = await this.call(apiKey);
    if (response.status === UNAUTHORIZED || response.status === FORBIDDEN) {
      await response.body?.cancel();
      throw new SendingDomainsUnavailableError(
        `la clé Resend de ce serveur n'a pas le droit de lire les domaines (réponse ${String(response.status)}) — une clé « envoi seulement » ne le peut pas.`,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SendingDomainsUnavailableError(`Resend a répondu ${String(response.status)}.`);
    }
    const parsed = domainsResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new SendingDomainsUnavailableError("la réponse de Resend n'a pas la forme attendue.");
    }
    return parsed.data.data
      .filter((domain) => domain.status === "verified")
      .map((domain) => domain.name.toLowerCase());
  }

  private async call(apiKey: string): Promise<Response> {
    try {
      return await fetch(RESEND_DOMAINS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new SendingDomainsUnavailableError("Resend est injoignable.", error);
    }
  }
}
