import { Injectable } from "@nestjs/common";

import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { ConsentConfirmTokens } from "../../domain/ports/consent-confirm-tokens.js";
import { SpacePublicOrigins } from "../../domain/ports/space-public-origins.js";

/**
 * Le préfixe de l'API sur la passerelle (`gateway/src/routes.ts`,
 * `API_PREFIXES.lfd`), puis la route publique de `ConsentConfirmController`.
 */
export const CONSENT_CONFIRM_PATH = "/api/lfd/mail/marketing/confirm/";

/**
 * **L'URL de confirmation d'un accord** (plan de désinscription, règle 18) :
 * l'origine publique de l'espace, le préfixe de la passerelle, le jeton —
 * comme celle de désinscription (`UnsubscribeLinks`).
 */
@Injectable()
export class ConsentConfirmLinks {
  constructor(
    private readonly origins: SpacePublicOrigins,
    private readonly tokens: ConsentConfirmTokens,
  ) {}

  /** `null` : l'origine de l'espace n'est pas configurée — aucun lien inventé. */
  urlFor(space: MailBrandCode, recipientKey: string, issuedAt: Date): string | null {
    const origin = this.origins.originOf(space);
    if (origin === null) {
      return null;
    }
    return `${origin}${CONSENT_CONFIRM_PATH}${this.tokens.seal({ space, recipientKey, issuedAt })}`;
  }
}
