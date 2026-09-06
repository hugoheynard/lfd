import type { PricingScopes } from "../domain/pricing-scopes.js";

/**
 * Une clause de portée, telle que Prisma la lit.
 *
 * **Mutable**, et pas `readonly` : `WhereInput` attend un tableau modifiable, et
 * lui rendre un tableau figé demanderait un cast au site d'appel — trois fois,
 * dans trois adaptateurs. Le `readonly` par défaut du dépôt cède ici devant une
 * signature qui n'est pas la nôtre.
 */
interface ScopeClause {
  scopeType: string;
  scopeId?: { in: string[] };
}

/**
 * **La clause de portée d'un panier**, écrite une fois pour les trois matériaux.
 *
 * Les trois lectures — règles, planchers, barèmes — sélectionnent la portée de
 * la même façon : `global`, ou l'une des trois égalités. Elles l'écrivaient
 * chacune, mot pour mot. Trois copies d'un `WHERE` qui décide d'un prix, c'est
 * trois endroits à corriger le jour où une cinquième forme de portée apparaît —
 * et deux chances d'en oublier un.
 *
 * `in: []` ne correspond à rien, ce qui est exactement juste : un panier qui ne
 * vise aucune famille ne doit ramener aucune règle de famille. Écrire la clause
 * conditionnellement aurait demandé de distinguer « aucune » de « toutes », et
 * c'est la distinction que `audienceFilter` doit faire, pas celle-ci.
 */
export function scopeFilter(scopes: PricingScopes): ScopeClause[] {
  return [
    { scopeType: "global" },
    { scopeType: "category", scopeId: { in: [...scopes.categoryIds] } },
    { scopeType: "product", scopeId: { in: [...scopes.productSkus] } },
    { scopeType: "variant", scopeId: { in: [...scopes.variantSkus] } },
  ];
}
