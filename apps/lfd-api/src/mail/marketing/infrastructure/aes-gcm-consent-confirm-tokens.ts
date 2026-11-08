import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { AesGcmFieldCipher } from "../../../platform/crypto/aes-gcm-field-cipher.js";
import { MAIL_BRANDS } from "../../requests/domain/value-objects/mail-brand.js";
import {
  ConsentConfirmTokens,
  type ConsentConfirmTarget,
} from "../domain/ports/consent-confirm-tokens.js";

/** Ce que le jeton chiffre, en clés courtes : l'espace, la clé d'adresse, l'instant (ms). */
interface TokenPayload {
  readonly s: string;
  readonly k: string;
  readonly i: number;
}

function isPayload(value: unknown): value is TokenPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "s" in value &&
    "k" in value &&
    "i" in value &&
    typeof value.s === "string" &&
    typeof value.k === "string" &&
    typeof value.i === "number" &&
    Number.isSafeInteger(value.i)
  );
}

/**
 * Le jeton de confirmation en **AES-256-GCM** (plan de désinscription,
 * règle 18), par le coffre de champ du dépôt, sous une clé DÉRIVÉE pour ce
 * seul usage (`AppConfig.mailMarketingConfirmTokenKey`, étiquette
 * `lfd/mail-marketing-confirm/v1`). Authentifié : un jeton altéré ne
 * s'ouvre pas. Il porte l'instant de la demande ; sa durée se juge à
 * l'ouverture du lien, par l'horloge, jamais ici.
 */
@Injectable()
export class AesGcmConsentConfirmTokens extends ConsentConfirmTokens {
  private readonly cipher: AesGcmFieldCipher;

  constructor(config: AppConfig) {
    super();
    this.cipher = new AesGcmFieldCipher(config.mailMarketingConfirmTokenKey());
  }

  seal(target: ConsentConfirmTarget): string {
    const payload: TokenPayload = {
      s: target.space,
      k: target.recipientKey,
      i: target.issuedAt.getTime(),
    };
    return this.cipher.seal(JSON.stringify(payload));
  }

  open(token: string): ConsentConfirmTarget | null {
    const payload = this.payloadOf(token);
    if (payload === null) {
      return null;
    }
    const space = MAIL_BRANDS.find((known) => known === payload.s);
    return space === undefined || payload.k.length === 0
      ? null
      : { space, recipientKey: payload.k, issuedAt: new Date(payload.i) };
  }

  /**
   * Un jeton illisible n'est PAS une erreur à remonter : la page répond la
   * même chose pour tout jeton (pas d'oracle), et rien n'est journalisé. Le
   * refus EST la valeur `null`.
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
