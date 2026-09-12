import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { FieldEncryptionKeyError, SealedValueUnreadableError } from "./crypto-errors.js";
import { FieldCipher } from "./field-cipher.js";

/** AES-256 : la clé fait 32 octets, ni plus ni moins. */
const KEY_BYTES = 32;
/** 96 bits, la taille pour laquelle GCM est spécifié — et la seule à ne rien coûter. */
const IV_BYTES = 12;
/** Le marqueur de format. Il existe pour qu'un CHANGEMENT de format soit lisible. */
const FORMAT = "v1";
/** De quoi reconnaître la clé sans la révéler. */
const FINGERPRINT_LENGTH = 8;
/** `v1`, empreinte, IV, tag, chiffré. */
const PART_COUNT = 5;

/**
 * Coffre de champ en **AES-256-GCM**.
 *
 * ## Pourquoi GCM et pas CBC
 *
 * GCM est **authentifié** : rouvrir un scellé modifié échoue au lieu de rendre
 * des octets plausibles. Sans ça, quelqu'un capable d'écrire en base pourrait
 * altérer un IBAN chiffré sans être détecté — le chiffrement protégerait la
 * confidentialité en abandonnant l'intégrité, ce qui est le pire des deux.
 *
 * ## Le format, et ce que chaque part fait là
 *
 * ```
 * v1.<empreinte de clé>.<IV>.<tag>.<chiffré>      (base64url, séparé par des points)
 * ```
 *
 * - **`v1`** — pour qu'un changement d'algorithme se lise au lieu de se deviner.
 * - **l'empreinte** — huit caractères de SHA-256 de la clé. Elle ne révèle pas
 *   la clé et permet de dire « scellé sous une AUTRE clé » plutôt que « tag
 *   invalide », qui enverrait chercher une corruption là où il y a une rotation.
 * - **l'IV** — tiré à neuf **à chaque scellement**. Réutiliser un IV en GCM ne
 *   dégrade pas la sécurité, il la détruit : deux messages sous le même couple
 *   (clé, IV) livrent leur XOR, et la clé d'authentification avec.
 * - **le tag** — les 16 octets d'authentification.
 *
 * **base64url** parce que le séparateur est un point : la base64 ordinaire porte
 * `+`, `/` et `=`, dont aucun ne gêne ici, mais le scellé finit dans des URL de
 * débogage et des journaux, et un encodage qui n'a pas besoin d'échappement
 * évite une classe entière de mésaventures.
 *
 * @throws {FieldEncryptionKeyError} à la construction, si la clé n'a pas 32 octets.
 */
@Injectable()
export class AesGcmFieldCipher extends FieldCipher {
  private readonly key: Buffer;
  private readonly fingerprint: string;

  constructor(key: Buffer) {
    super();
    if (key.length !== KEY_BYTES) {
      throw new FieldEncryptionKeyError(
        `${String(KEY_BYTES)} octets attendus, ${String(key.length)} reçus`,
      );
    }
    this.key = key;
    this.fingerprint = createHash("sha256").update(key).digest("hex").slice(0, FINGERPRINT_LENGTH);
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [
      FORMAT,
      this.fingerprint,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      sealed.toString("base64url"),
    ].join(".");
  }

  open(sealed: string): string {
    const parts = sealed.split(".");
    if (parts.length !== PART_COUNT) {
      throw new SealedValueUnreadableError("format inattendu");
    }

    const [format, fingerprint, iv, tag, payload] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
    if (format !== FORMAT) {
      throw new SealedValueUnreadableError(`format « ${format} » inconnu de cette version`);
    }
    // Dit AVANT l'échec d'authentification, qui dirait la même chose sans
    // distinguer une rotation de clé d'une colonne abîmée.
    if (fingerprint !== this.fingerprint) {
      throw new SealedValueUnreadableError("scellée sous une autre clé");
    }

    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(payload, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // La cause n'est pas propagée : elle porterait des octets du scellé.
      throw new SealedValueUnreadableError("authentification refusée — contenu altéré");
    }
  }
}
