import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { TokenGenerator } from "../domain/ports/token-generator.js";

/** 32 octets : 256 bits d'aléa, hors de portée d'un essai systématique. */
const TOKEN_BYTES = 32;

/** L'adaptateur de production : l'aléa cryptographique de `node:crypto`. */
@Injectable()
export class RandomTokenGenerator extends TokenGenerator {
  next(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url");
  }
}
