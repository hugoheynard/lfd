import { Injectable } from "@nestjs/common";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { SecretGenerator } from "../../../../platform/secret/secret-generator.js";
import { hashVitrineReadKey } from "../../domain/services/vitrine-read-key.js";
import type { StoredVitrineCredentials } from "../../domain/vitrine-subscriber.js";

/** Des préfixes lisibles : une clé collée au mauvais endroit se reconnaît. */
const SECRET_PREFIX = "vtrsec_";
const KEY_PREFIX = "vtrkey_";

/** Ce qu'on montre UNE fois, et ce qu'on range. */
export interface MintedVitrineCredentials {
  readonly signingSecret: string;
  readonly readKey: string;
  readonly stored: StoredVitrineCredentials;
}

/**
 * Tire un secret de signature et une clé de lecture (130 bits chacun), et dit
 * comment les ranger : le secret SCELLÉ (il faut le relire pour signer), la
 * clé HACHÉE (elle n'est que comparée). Les deux en clair ne vivent que le
 * temps de la réponse — c'est la seule fois qu'on les montre.
 */
@Injectable()
export class VitrineCredentialsMint {
  constructor(
    private readonly secrets: SecretGenerator,
    private readonly cipher: FieldCipher,
  ) {}

  mint(): MintedVitrineCredentials {
    const signingSecret = `${SECRET_PREFIX}${this.secrets.next()}`;
    const readKey = `${KEY_PREFIX}${this.secrets.next()}`;
    return {
      signingSecret,
      readKey,
      stored: {
        signingSecretSealed: this.cipher.seal(signingSecret),
        readKeyHash: hashVitrineReadKey(readKey),
      },
    };
  }
}
