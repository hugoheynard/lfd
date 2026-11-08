import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { AesGcmFieldCipher } from "../../../platform/crypto/aes-gcm-field-cipher.js";
import { MAIL_BRANDS } from "../../requests/domain/value-objects/mail-brand.js";
import { UnsubscribeTokens, type UnsubscribeTarget } from "../domain/ports/unsubscribe-tokens.js";

/** Ce que le jeton chiffre, en clés courtes : l'URL reste lisible dans un en-tête. */
interface TokenPayload {
  readonly s: string;
  readonly k: string;
}

function isPayload(value: unknown): value is TokenPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "s" in value &&
    "k" in value &&
    typeof value.s === "string" &&
    typeof value.k === "string"
  );
}

/**
 * Le jeton en **AES-256-GCM** (plan de désinscription, règle 4), par le
 * coffre de champ du dépôt, sous une clé DÉRIVÉE pour ce seul usage
 * (`AppConfig.mailUnsubscribeTokenKey`, étiquette `lfd/mail-unsubscribe/v1`).
 * Authentifié : un jeton altéré ne s'ouvre pas. Sans date : il ne meurt qu'à
 * la rotation de la clé.
 */
@Injectable()
export class AesGcmUnsubscribeTokens extends UnsubscribeTokens {
  private readonly cipher: AesGcmFieldCipher;

  constructor(config: AppConfig) {
    super();
    this.cipher = new AesGcmFieldCipher(config.mailUnsubscribeTokenKey());
  }

  seal(target: UnsubscribeTarget): string {
    const payload: TokenPayload = { s: target.space, k: target.recipientKey };
    return this.cipher.seal(JSON.stringify(payload));
  }

  open(token: string): UnsubscribeTarget | null {
    const payload = this.payloadOf(token);
    if (payload === null) {
      return null;
    }
    const space = MAIL_BRANDS.find((known) => known === payload.s);
    return space === undefined || payload.k.length === 0
      ? null
      : { space, recipientKey: payload.k };
  }

  /**
   * Un jeton illisible n'est PAS une erreur à remonter : la page répond la
   * même chose pour tout jeton (pas d'oracle), et rien n'est journalisé —
   * le jeton désinscrit qui le présente. Le refus EST la valeur `null`.
   */
  private payloadOf(token: string): TokenPayload | null {
    try {
      const parsed: unknown = JSON.parse(this.cipher.open(token));
      return isPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
