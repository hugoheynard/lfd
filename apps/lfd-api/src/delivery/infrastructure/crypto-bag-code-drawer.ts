import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { BagCodeDrawer } from "../domain/ports/bag-code-drawer.js";
import { BAG_CODE_ALPHABET, BAG_CODE_LENGTH } from "../domain/value-objects/bag-code.js";

/**
 * Adaptateur de production : `randomBytes` de `node:crypto`. Un octet réduit
 * modulo 32 reste UNIFORME, puisque 256 est un multiple exact de 32 (même
 * raisonnement que `RandomSecretGenerator`).
 */
@Injectable()
export class CryptoBagCodeDrawer extends BagCodeDrawer {
  draw(): string {
    return Array.from(randomBytes(BAG_CODE_LENGTH), (byte) =>
      BAG_CODE_ALPHABET.charAt(byte % BAG_CODE_ALPHABET.length),
    ).join("");
  }
}
