import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { BinCodeDrawer } from "../domain/ports/bin-code-drawer.js";
import { BIN_CODE_ALPHABET, BIN_CODE_LENGTH } from "../domain/value-objects/bin-code.js";

/**
 * Adaptateur de production : `randomBytes` de `node:crypto`. Un octet réduit
 * modulo 32 reste UNIFORME, puisque 256 est un multiple exact de 32 (même
 * raisonnement que `RandomSecretGenerator`).
 */
@Injectable()
export class CryptoBinCodeDrawer extends BinCodeDrawer {
  draw(): string {
    return Array.from(randomBytes(BIN_CODE_LENGTH), (byte) =>
      BIN_CODE_ALPHABET.charAt(byte % BIN_CODE_ALPHABET.length),
    ).join("");
  }
}
