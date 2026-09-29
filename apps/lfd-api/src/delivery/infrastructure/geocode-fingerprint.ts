import { createHash } from "node:crypto";

/**
 * **L'empreinte d'une adresse** (L7-C10) — le SHA-256 hexadécimal de sa clé
 * normalisée (`addressKeyOf`). C'est tout ce que le cache garde d'une
 * adresse : aucune ne s'y lit en clair.
 */
export function geocodeFingerprint(addressKey: string): string {
  return createHash("sha256").update(addressKey, "utf8").digest("hex");
}
