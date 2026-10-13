import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { CancellationLinkSigner } from "../domain/ports/cancellation-link-signer.js";

/**
 * `base64url(HMAC-SHA256(orderId))` sous la clé dérivée de `AppConfig`
 * (`cancellationLinkKey`, C6.4, B1). La vérification RECALCULE et compare en
 * temps constant : un jeton de longueur différente est refusé avant la
 * comparaison, ce qui ne dit rien de la clé.
 */
@Injectable()
export class HmacCancellationLinkSigner extends CancellationLinkSigner {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    super();
    this.key = config.cancellationLinkKey();
  }

  sign(orderId: string): string {
    return createHmac("sha256", this.key).update(orderId, "utf8").digest("base64url");
  }

  matches(orderId: string, token: string): boolean {
    const expected = Buffer.from(this.sign(orderId), "utf8");
    const received = Buffer.from(token, "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
