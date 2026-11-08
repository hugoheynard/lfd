import { createHmac } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { AddressPrint } from "../domain/ports/address-print.js";

/** `HMAC-SHA256(clé d'adresse)` en hexadécimal, sous `AppConfig.mailMarketingPrintKey`. */
@Injectable()
export class HmacAddressPrint extends AddressPrint {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    super();
    this.key = config.mailMarketingPrintKey();
  }

  of(recipientKey: string): string {
    return createHmac("sha256", this.key).update(recipientKey, "utf8").digest("hex");
  }
}
