/**
 * **Comment les montants d'une commande sont composés** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 4, § 7, voie B).
 *
 * - `line_ht` : le calcul pro — HT de ligne arrondi une fois, TVA une fois par
 *   taux sur l'assiette (`ventilateVat`). Celui de TOUTE commande d'avant le
 *   2026-10-27, particuliers compris ;
 * - `exact_ht` : la commande d'un particulier, composée en TTC — chaque ligne
 *   vaut quantité × étiquette, la TVA s'extrait par taux au centime supérieur,
 *   et le HT de chaque terme est le dernier nombre calculé (`composeTtcOrder`).
 *
 * ⚠️ Ces deux valeurs sont **persistées** (`orders.vat_method`,
 * `delivery_note.vat_method`) : les renommer est une migration de données.
 */
export const ORDER_VAT_METHODS = ["line_ht", "exact_ht"] as const;
export type OrderVatMethod = (typeof ORDER_VAT_METHODS)[number];

/**
 * La méthode d'une commande **qu'on passe** : `exact_ht` sans société,
 * `line_ht` pour une société — la même partition que `clienteleOf`, et jamais
 * l'audience tarifaire (une société en attente est tarifée B2C mais reste une
 * commande pro, et un pro ne change pas d'un centime).
 *
 * 🔴 Ne sert qu'à la PASSATION. Une commande existante se relit sur sa
 * colonne : une commande `line_ht` d'un particulier, révisée après le
 * déploiement, reste `line_ht` (§ 5, « La révision d'une commande »).
 */
export function placementVatMethodOf(companyId: string | null): OrderVatMethod {
  return companyId === null ? "exact_ht" : "line_ht";
}

/** Une valeur relue — `null` si elle n'est pas l'une des deux méthodes. */
export function asOrderVatMethod(value: string): OrderVatMethod | null {
  return value === "line_ht" || value === "exact_ht" ? value : null;
}
