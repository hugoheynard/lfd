/**
 * **Les niveaux de l'accès aux fonctionnalités**, sans zod.
 *
 * ⚠️ Ils vivent ICI et non dans `feature-access.ts` pour une raison de POIDS,
 * pas de rangement — la même que `platform-content.defaults.ts`. L'app cliente
 * a besoin de `isAtLeast` comme d'une vraie valeur, dès le démarrage ; la
 * prendre au baril du paquet embarquait zod dans son bundle initial. Mesuré le
 * 2026-09-14 : 1,44 Mo pour un budget d'erreur de 1,30 Mo en configuration
 * `cloudflare`, c'est-à-dire un déploiement qui échoue.
 *
 * Ce module n'importe rien. `feature-access.ts` le réexporte : le backend et le
 * baril n'y voient aucune différence. Un front importe ses valeurs par
 * `@lfd/contracts/feature-access-levels`.
 *
 * Plan et décisions : `documentation/b2b/plan-inscription-pro-seule.md` §2.
 */

/** Les niveaux de la boutique, du plus fermé au plus ouvert. L'ordre EST la règle. */
export const SHOP_LEVELS = ["closed", "browse", "order"] as const;
export type ShopLevel = (typeof SHOP_LEVELS)[number];

/** Une entrée du catalogue : ce que l'écran en montre, et ce que le code en décide. */
export interface FeatureDefinition<Level extends string> {
  readonly label: string;
  readonly description: string;
  /** Du plus fermé au plus ouvert. */
  readonly levels: readonly Level[];
  /** La valeur quand aucune dérogation n'est posée. */
  readonly defaultLevel: Level;
}

/**
 * **Le catalogue fermé.** Une seule entrée au 2026-09-14, et c'est voulu (plan §7) :
 * un flag de plus est une décision, pas une ligne qu'on ajoute en passant.
 */
export const FEATURE_CATALOGUE = {
  shop: {
    label: "Boutique",
    description:
      "Ce que les clients peuvent faire de la boutique en ligne : rien (fermée), voir le catalogue et ses prix, ou commander.",
    levels: SHOP_LEVELS,
    defaultLevel: "order",
  },
} as const satisfies Readonly<Record<string, FeatureDefinition<string>>>;

export type FeatureKey = keyof typeof FEATURE_CATALOGUE;
/** Les niveaux possibles d'une clé donnée. */
export type FeatureLevel<Key extends FeatureKey = FeatureKey> =
  (typeof FEATURE_CATALOGUE)[Key]["levels"][number];

/** Les clés, dans l'ordre du catalogue. */
export const FEATURE_KEYS: readonly FeatureKey[] = ["shop"];

/** Vrai si `key` est une clé du catalogue — une ligne de base peut en porter une disparue. */
export function isFeatureKey(key: string): key is FeatureKey {
  return FEATURE_KEYS.some((known) => known === key);
}

/** Les niveaux ordonnés d'une clé, typés largement pour les comparaisons. */
export function featureLevelsOf(key: FeatureKey): readonly string[] {
  return FEATURE_CATALOGUE[key].levels;
}

/** Vrai si `value` est un niveau de cette clé. */
export function isFeatureLevel<Key extends FeatureKey>(
  key: Key,
  value: string,
): value is FeatureLevel<Key> {
  return featureLevelsOf(key).includes(value);
}

/** Le niveau le plus ouvert d'une clé : celui qu'une exemption accorde. */
export function mostOpenLevel<Key extends FeatureKey>(key: Key): FeatureLevel<Key> {
  const levels: readonly FeatureLevel<Key>[] = FEATURE_CATALOGUE[key].levels;
  // Le catalogue est `as const` et chaque liste a au moins un niveau : le repli
  // sur le défaut ne se produit jamais, il évite seulement un `!`.
  return levels[levels.length - 1] ?? FEATURE_CATALOGUE[key].defaultLevel;
}

/**
 * **« Au moins tel niveau »** — le seul test qu'une garde écrit.
 *
 * Pure : l'ordre vient du catalogue, jamais d'une comparaison de chaînes.
 */
export function isAtLeast<Key extends FeatureKey>(
  key: Key,
  actual: FeatureLevel<Key>,
  required: FeatureLevel<Key>,
): boolean {
  const levels = featureLevelsOf(key);
  return levels.indexOf(actual) >= levels.indexOf(required);
}
