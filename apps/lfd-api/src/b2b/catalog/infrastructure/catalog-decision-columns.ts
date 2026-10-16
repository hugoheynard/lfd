/**
 * **Les colonnes de décision qu'on lit** dans `catalog_item_overrides` — et
 * elles seules.
 *
 * 🔴 Les deux colonnes de prix décidé (`price_millicents`,
 * `decided_public_ttc_cents`) n'y sont pas, et c'est le but : depuis le lot D
 * de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`
 * (2026-10-15), le prix servi est celui du référentiel. Les colonnes restent
 * en base (CLAUDE.md §0), ni lues ni écrites. Un `include: { override: true }`
 * les relirait sans que rien ne le dise ; tous les lecteurs de l'override
 * passent donc par cette sélection.
 */
export const DECISION_COLUMNS = {
  isHidden: true,
  isHiddenPublic: true,
  isFeatured: true,
  decidedBy: true,
  decidedAt: true,
} as const;
