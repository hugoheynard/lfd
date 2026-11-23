import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { ExportKeySecretSource } from "../domain/ports/export-key-secret-source.js";

/** 32 octets : 256 bits d'aléa, hors de portée d'un essai systématique. */
const SECRET_BYTES = 32;

/** L'adaptateur de production : l'aléa cryptographique de `node:crypto`, en base64url. */
@Injectable()
export class RandomExportKeySecretSource extends ExportKeySecretSource {
  next(): string {
    return randomBytes(SECRET_BYTES).toString("base64url");
  }
}
