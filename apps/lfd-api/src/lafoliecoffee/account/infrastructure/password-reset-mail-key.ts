import type { IdGenerator } from "../../../platform/id/id-generator.js";

/**
 * Clé d'idempotence d'un lien de mot de passe demandé par la personne : une
 * par GESTE (chaque demande émet un ticket neuf), sans donnée personnelle —
 * ni l'adresse, ni le `sub`, qui est un identifiant chez un tiers.
 */
export function passwordResetMailKey(ids: IdGenerator): string {
  return `account.password-reset:${ids.next()}`;
}
