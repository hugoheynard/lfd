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

/**
 * Les niveaux d'une surface qu'on MONTRE ou qu'on cache dans l'app cliente.
 *
 * ⚠️ Masquer n'est pas fermer : ces clés ne gardent aucune route serveur. Une
 * commande déjà passée garde son suivi, son règlement et son QR de retrait par
 * lien direct (décision de Hugo, 2026-09-14).
 */
export const VISIBILITY_LEVELS = ["hidden", "visible"] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/**
 * Les niveaux d'une surface que le SERVEUR ferme : `closed` refuse la route en
 * 409, `open` la sert.
 *
 * ⚠️ Distincts de {@link VISIBILITY_LEVELS}, et c'est le sujet : `hidden` ne
 * ferme rien, `closed` si. Réutiliser `hidden`/`visible` pour une clé gardée
 * ferait lire « masqué » là où la route refuse — la confusion même que la
 * contradiction du plan mandat client a relevée (plan
 * `documentation/comptabilite/plan-mandat-client.md` §6 #1, 2026-09-14).
 */
export const GATE_LEVELS = ["closed", "open"] as const;
export type GateLevel = (typeof GATE_LEVELS)[number];

/** Une entrée du catalogue : ce que l'écran en montre, et ce que le code en décide. */
export interface FeatureDefinition<Level extends string> {
  readonly label: string;
  readonly description: string;
  /** Du plus fermé au plus ouvert. */
  readonly levels: readonly Level[];
  /** La valeur quand aucune dérogation n'est posée. */
  readonly defaultLevel: Level;
  /**
   * Une adresse exemptée peut-elle ouvrir cette clé pour elle seule ?
   *
   * `false` quand ouvrir à une personne n'a pas de sens métier : un mandat de
   * prélèvement signé par un testeur est un vrai mandat, sur un vrai compte.
   * Le résolveur ignore alors les exemptions, et l'ajout d'une exemption est
   * refusé.
   */
  readonly exemptible: boolean;
}

/**
 * **Le catalogue fermé.** Un flag de plus est une décision, pas une ligne qu'on
 * ajoute en passant (plan §7) : `shop` le 2026-09-14, puis les trois surfaces
 * masquables le même jour, à la demande de Hugo.
 */
export const FEATURE_CATALOGUE = {
  shop: {
    label: "Boutique",
    description:
      "Ce que les clients peuvent faire de la boutique en ligne : rien (fermée), voir le catalogue et ses prix, ou commander.",
    levels: SHOP_LEVELS,
    defaultLevel: "order",
    exemptible: true,
  },
  orders: {
    label: "Mes commandes",
    description:
      "La liste « Mes commandes » de l'app cliente et son entrée de menu. Masquée, le suivi, le règlement et le QR de retrait d'une commande restent joignables par lien direct.",
    levels: VISIBILITY_LEVELS,
    defaultLevel: "visible",
    exemptible: true,
  },
  invoices: {
    label: "Mes factures",
    description: "L'écran « Mes factures » de l'app cliente et son entrée de menu.",
    levels: VISIBILITY_LEVELS,
    defaultLevel: "visible",
    exemptible: true,
  },
  desktopMenu: {
    label: "Menu au bureau",
    description:
      "La sous-barre d'onglets sous le bandeau, sur grand écran. Le menu du téléphone et la barre du haut ne changent pas.",
    levels: VISIBILITY_LEVELS,
    defaultLevel: "visible",
    exemptible: true,
  },
  customerMandate: {
    label: "Mandat SEPA client",
    description:
      "La génération, le téléchargement et le dépôt du mandat de prélèvement depuis « Mon compte ». Fermé, les routes client du mandat refusent ; le staff garde tous ses gestes.",
    levels: GATE_LEVELS,
    defaultLevel: "closed",
    // 🔴 Non exemptible (plan mandat client §8, 2026-09-14) : ce que la clé
    // ouvre produit une autorisation de débit opposable, pas un aperçu.
    exemptible: false,
  },
} as const satisfies Readonly<Record<string, FeatureDefinition<string>>>;

export type FeatureKey = keyof typeof FEATURE_CATALOGUE;
/** Les niveaux possibles d'une clé donnée. */
export type FeatureLevel<Key extends FeatureKey = FeatureKey> =
  (typeof FEATURE_CATALOGUE)[Key]["levels"][number];

/** Les clés, dans l'ordre du catalogue. */
export const FEATURE_KEYS: readonly FeatureKey[] = [
  "shop",
  "orders",
  "invoices",
  "desktopMenu",
  "customerMandate",
];

/** Les clés qui se montrent ou se cachent, sans garde serveur. */
export type VisibilityFeatureKey = "orders" | "invoices" | "desktopMenu";

/**
 * Les clés qu'aucune exemption n'ouvre — calculées depuis le catalogue, pour
 * qu'une clé déclarée `exemptible: false` n'ait pas à être recopiée ici.
 */
export type UnexemptibleFeatureKey = {
  [Key in FeatureKey]: (typeof FEATURE_CATALOGUE)[Key]["exemptible"] extends false ? Key : never;
}[FeatureKey];

/** Vrai si une exemption peut ouvrir cette clé. */
export function isExemptible(key: FeatureKey): boolean {
  return FEATURE_CATALOGUE[key].exemptible;
}

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
