import { createHmac } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { RecipientFingerprint } from "../domain/ports/recipient-fingerprint.js";

/** `HMAC-SHA256(adresse normalisée)` en hexadécimal, sous `AppConfig.mailRecipientSearchKey`. */
@Injectable()
export class HmacRecipientFingerprint extends RecipientFingerprint {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    super();
    this.key = config.mailRecipientSearchKey();
  }

  of(recipientKey: string): string {
    return createHmac("sha256", this.key).update(recipientKey, "utf8").digest("hex");
  }
}
