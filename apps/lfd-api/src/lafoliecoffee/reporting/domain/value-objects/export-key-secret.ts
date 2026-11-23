import { createHash } from "node:crypto";

/**
 * Le **haché** d'un secret de clé d'export : SHA-256, en hexadécimal
 * minuscule. Seul lui est gardé ; la garde hache l'en-tête reçu et cherche la
 * clé par ce haché. Un secret de 256 bits tiré au hasard n'a pas besoin d'un
 * hachage lent : il ne se devine pas, il ne peut que fuir.
 */
export function hashExportKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
