import { Injectable } from "@nestjs/common";

import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import { SpacePublicOrigins } from "../../domain/ports/space-public-origins.js";
import { UnsubscribeTokens } from "../../domain/ports/unsubscribe-tokens.js";
import { marketingKeyOf } from "../../domain/value-objects/marketing-address.js";

/**
 * Le préfixe de l'API sur la passerelle (`gateway/src/routes.ts`,
 * `API_PREFIXES.lfd`), puis la route publique de `UnsubscribeController`.
 */
export const UNSUBSCRIBE_PATH = "/api/lfd/mail/unsubscribe/";

/**
 * **L'URL de désinscription d'une adresse pour un espace** (plan de
 * désinscription, règles 3 et 4) : l'origine publique de l'espace, le
 * préfixe de la passerelle, le jeton. Posée par le BLOC, jamais par
 * l'appelant (B2) ; lue par le rendu et les en-têtes RFC 8058 (U3).
 */
@Injectable()
export class UnsubscribeLinks {
  constructor(
    private readonly origins: SpacePublicOrigins,
    private readonly tokens: UnsubscribeTokens,
  ) {}

  /** `null` : l'origine de l'espace n'est pas configurée — aucun lien inventé. */
  urlFor(space: MailBrandCode, address: string): string | null {
    const origin = this.origins.originOf(space);
    if (origin === null) {
      return null;
    }
    const token = this.tokens.seal({ space, recipientKey: marketingKeyOf(address) });
    return `${origin}${UNSUBSCRIBE_PATH}${token}`;
  }
}
