import { createHash } from "node:crypto";

/**
 * **L'empreinte d'un compte** — SHA-256 hexadécimal de l'IBAN normalisé
 * (sans espace ni tiret, en majuscules : la normalisation d'`Iban.create`).
 *
 * C'est ce que l'export des mandats garde à la place de l'IBAN (plan
 * `plan-export-des-mandats-pour-la-banque.md`, § 2 bis-1) : assez pour dire
 * « ce mandat est parti sous CE compte », jamais assez pour débiter qui que
 * ce soit. Normaliser avant de hacher évite qu'un IBAN recopié avec ses
 * espaces passe pour un autre compte.
 */
export function accountFingerprint(iban: string): string {
  const normalized = iban.replace(/[\s-]/gu, "").toUpperCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
