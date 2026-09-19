import { ORDER_TIME_LIMIT_SCOPE_LABELS, type OrderTimeLimitScopeType } from "@lfd/pim-contracts";

/**
 * **La portée d'une limite, en mots** — le `subjectLabel` de ses faits au
 * journal (lot B du plan des phrases, D6, 2026-09-19) : « Toute la
 * production », « Famille « Tartes » », « Produit VIE-001 ».
 *
 * Les mots du type sont ceux de l'écran des réglages
 * (`ORDER_TIME_LIMIT_SCOPE_LABELS`). Une cible que le référentiel ne nomme
 * plus se dit par son identifiant : on n'invente pas un nom qu'on n'a pas.
 */
export function limitScopeLabel(
  scope: { readonly type: OrderTimeLimitScopeType; readonly id: string | null },
  targetName: string | null,
): string {
  const kind = ORDER_TIME_LIMIT_SCOPE_LABELS[scope.type];
  if (scope.id === null) {
    return kind;
  }
  return targetName === null || targetName === ""
    ? `${kind} ${scope.id}`
    : `${kind} « ${targetName} »`;
}
