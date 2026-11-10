import { createHash } from "node:crypto";

/**
 * L'empreinte d'une clé de lecture, telle que la base la range (SHA-256, hex).
 *
 * Un hachage simple suffit, sans sel ni étirement : la clé est un tirage de
 * 130 bits (`SecretGenerator`), pas un mot de passe choisi par un humain — il
 * n'y a pas de dictionnaire à décourager.
 */
export function hashVitrineReadKey(readKey: string): string {
  return createHash("sha256").update(readKey, "utf8").digest("hex");
}
