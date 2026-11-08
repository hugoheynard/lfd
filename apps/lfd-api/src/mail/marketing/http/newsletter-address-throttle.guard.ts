import { createHash } from "node:crypto";

import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ThrottlerException, ThrottlerStorage } from "@nestjs/throttler";

/** Une même adresse : quelques demandes par heure — de quoi se reprendre, pas de quoi harceler. */
export const NEWSLETTER_REQUESTS_PER_ADDRESS = 3;
export const NEWSLETTER_ADDRESS_WINDOW_MS = 60 * 60_000;
const NAME = "mail-newsletter-address";

interface RequestWithBody {
  readonly body?: unknown;
}

/** L'adresse du corps, normalisée comme le registre la range ; `null` sans adresse lisible. */
function addressOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }
  const { email } = body;
  return typeof email === "string" && email.trim() !== "" ? email.trim().toLowerCase() : null;
}

/**
 * **Le débit par ADRESSE du champ de la lettre** (plan de désinscription,
 * C5), à côté du seau par IP : sans lui, quelques IP suffiraient à faire
 * partir des dizaines d'e-mails de confirmation vers la même boîte. La clé
 * du compteur est l'EMPREINTE SHA-256 de l'adresse normalisée : l'adresse ne
 * reste pas en clair dans la mémoire du limiteur.
 *
 * Il ne regarde ni le registre ni le champ piège : la réponse au-delà du
 * débit (`429`) est la même pour toute adresse.
 *
 * ⚠️ Le stockage est celui du processus, comme le limiteur global.
 */
@Injectable()
export class NewsletterAddressThrottleGuard implements CanActivate {
  constructor(@Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const address = addressOf(context.switchToHttp().getRequest<RequestWithBody>().body);
    if (address === null) {
      return true;
    }
    const key = createHash("sha256").update(address, "utf8").digest("hex");
    const record = await this.storage.increment(
      `${NAME}:${key}`,
      NEWSLETTER_ADDRESS_WINDOW_MS,
      NEWSLETTER_REQUESTS_PER_ADDRESS,
      NEWSLETTER_ADDRESS_WINDOW_MS,
      NAME,
    );
    if (record.isBlocked) {
      throw new ThrottlerException();
    }
    return true;
  }
}
