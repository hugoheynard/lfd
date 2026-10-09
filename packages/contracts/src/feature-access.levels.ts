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
 * `@lfd/contracts/feature-access-levels` — aucun ne le fait depuis le
 * 2026-10-09 (vérifié ce jour-là) : l'app cliente n'en tirait que `isAtLeast`
 * pour la boutique, retirée. Le sous-chemin reste, pour qu'une valeur ajoutée
 * ici ne repasse jamais par le baril et zod.
 *
 * Plan et décisions : `documentation/auth-inscription/plan-inscription-pro-seule.md` §2.
 */

/**
 * Les niveaux d'une surface qu'on MONTRE ou qu'on cache dans une app cliente.
 *
 * ⚠️ Masquer n'est pas fermer : une clé à ces niveaux ne garde aucune route
 * serveur. Retirés le 2026-10-09 avec leurs clés, réintroduits le même jour pour
 * `facebookLogin` (Hugo) — un bouton qu'on cache, pas une porte qu'on ferme.
 */
export const VISIBILITY_LEVELS = ["hidden", "visible"] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/**
 * Les niveaux d'une surface que le SERVEUR ferme : `closed` refuse la route en
 * 409, `open` la sert.
 *
 * ⚠️ Distincts de {@link VISIBILITY_LEVELS}, et c'est le sujet : masquer ne
 * ferme rien, `closed` si — la confusion que la contradiction du plan mandat
 * client a relevée (plan `documentation/comptabilite/mandat/plan-mandat-client.md`
 * §6 #1, 2026-09-14).
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
 * **Les clés retirées le 2026-10-09** (Hugo) : `shop`, `orders`, `invoices`,
 * `desktopMenu`, `publicDelivery`. Leur comportement est désormais celui de leur
 * niveau le plus ouvert — boutique ouverte à la commande, menus et écrans
 * toujours montrés — et la livraison aux particuliers ne dépend plus que du
 * réglage admin « Livraison » (`openToB2c`), que la composition du panier
 * applique au devis comme à la passation. Deux réglages pour une même porte se
 * contredisaient. Les lignes de base qui les portent encore ne sont pas
 * effacées : le catalogue ne les connaît plus, l'écran admin les signale
 * (`unknown_key`) et rien ne les interprète.
 */

/**
 * **Le catalogue fermé.** Un flag de plus est une décision, pas une ligne qu'on
 * ajoute en passant (plan §7). Il ne portait plus que `customerMandate` le
 * matin du 2026-10-09 (cf. plus haut) ; `facebookLogin` s'y est ajouté le même
 * jour, à la demande de Hugo.
 */
export const FEATURE_CATALOGUE = {
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
  facebookLogin: {
    label: "Connexion par Facebook",
    description:
      "Le bouton « Continuer avec Facebook » de l'accueil et de la fenêtre de connexion de la boutique. Visible, il ne fonctionne que si la connexion Facebook est aussi activée dans Auth0.",
    levels: VISIBILITY_LEVELS,
    defaultLevel: "hidden",
    // Non exemptible : l'écran de connexion précède toute identité, aucune
    // adresse ne peut donc compter — seul le niveau global a du sens.
    // Aucune garde serveur : cacher le bouton suffit, la connexion elle-même
    // se règle chez Auth0.
    exemptible: false,
  },
} as const satisfies Readonly<Record<string, FeatureDefinition<string>>>;

export type FeatureKey = keyof typeof FEATURE_CATALOGUE;
/** Les niveaux possibles d'une clé donnée. */
export type FeatureLevel<Key extends FeatureKey = FeatureKey> =
  (typeof FEATURE_CATALOGUE)[Key]["levels"][number];

/** Les clés, dans l'ordre du catalogue. */
export const FEATURE_KEYS: readonly FeatureKey[] = ["customerMandate", "facebookLogin"];

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
