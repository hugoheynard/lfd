import { createHmac } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PayLinkTokenVault } from "../domain/ports/pay-link-token-vault.js";

/**
 * Le coffre des jetons : l'empreinte est un HMAC-SHA-256 sous
 * `payLinkTokenKey()` (dérivée de la clé du coffre, sous son étiquette), le
 * scellé passe par le coffre de champs.
 */
@Injectable()
export class HmacPayLinkTokenVault extends PayLinkTokenVault {
  private readonly key: Buffer;

  constructor(
    config: AppConfig,
    private readonly cipher: FieldCipher,
  ) {
    super();
    this.key = config.payLinkTokenKey();
  }

  fingerprint(token: string): string {
    return createHmac("sha256", this.key).update(token, "utf8").digest("hex");
  }

  seal(token: string): string {
    return this.cipher.seal(token);
  }

  open(sealed: string): string {
    return this.cipher.open(sealed);
  }
}
