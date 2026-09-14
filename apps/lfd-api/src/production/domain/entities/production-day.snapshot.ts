/**
 * **La forme d'une journée de fabrication** — ce que l'agrégat porte, et ce que
 * l'adaptateur écrit et relit.
 *
 * Des types, et aucune règle. Sortis de `production-day.ts` le 2026-09-14,
 * quand le fichier dépassait six cents lignes : ils n'y portaient aucun
 * invariant, et les lire obligeait à traverser toutes les règles de la journée.
 * `production-day.ts` les réexporte — l'agrégat reste le point d'entrée.
 */

/** Une ligne de commande, figée du côté de la production. */
export interface ProductionLineSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** `null` = la ligne n'est pas encore dans le bac. C'est le fait du FOURNIL. */
  readonly packed: PackedLineMark | null;
}

/**
 * **La ligne est dans le bac**, telle que le poste de colisage la constate.
 *
 * ## Pourquoi un type à part, et pas un {@link PackedMark} élargi
 *
 * `PackedMark` porte la FERMETURE du bac, et rien ne signe une fermeture : elle
 * arrive par un scan, sans crayon. Lui ajouter `initials` lui donnerait un champ
 * qu'aucune colonne ne stocke et que personne n'écrit — exactement l'état que le
 * commentaire de `PackedMark` raconte avoir coûté cher, à l'envers.
 *
 * Sa forme est celle de {@link DoneMark}, et c'est une coïncidence de forme, pas
 * de sens : l'un dit « c'est sorti du four », l'autre « c'est dans le bac de ce
 * client-là ». Les fusionner ferait qu'un renommage de l'un renommerait l'autre.
 */
export interface PackedLineMark {
  readonly at: Date;
  readonly by: string;
  /** Vide autorisé sur une ligne pourtant au bac — on coche d'abord, on signe si on veut. */
  readonly initials: string;
}

/**
 * **Le colisage constaté** : l'instant ET son auteur, ensemble.
 *
 * 🔴 C'étaient deux champs nullables jusqu'au 2026-09-08, et ils pouvaient donc
 * se contredire — un instant sans auteur, un auteur sans instant. Aucun des deux
 * n'a de sens, et le jour où il a fallu **republier** le fait, il fallait un
 * `?? ""` sur l'auteur : une identité vide dans un événement, pour un état que
 * le modèle laissait exister sans jamais le produire. On corrige le modèle.
 */
export interface PackedMark {
  readonly at: Date;
  readonly by: string;
}

/** Une commande, figée du côté de la production. */
export interface ProductionOrderSnapshot {
  /** `null` = le bac n'est pas fait. C'est le fait du FOURNIL, pas du commerce. */
  readonly packed: PackedMark | null;
  /**
   * **Combien de containers cette commande occupe** — les bacs du véhicule.
   * `0` = personne ne les a encore comptés.
   *
   * 🔴 Rien à voir avec le `ContainerRule` de la fiche d'atelier, qui est le
   * matériel du FOUR réglé par SKU. Celui-ci se compte par COMMANDE, au
   * colisage. Les deux mots se ressemblent et ne désignent pas le même objet.
   */
  readonly containers: number;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly destination: string;
  readonly lines: readonly ProductionLineSnapshot[];
}

/**
 * **La ligne est sortie du four**, telle que le fournil la constate.
 *
 * Un seul objet et pas trois champs nullables, pour la raison exacte que
 * {@link PackedMark} a déjà coûtée : un instant sans auteur, ou un auteur sans
 * instant, sont deux états que rien ne produit et que le modèle laissait
 * pourtant exister.
 *
 * `initials` peut être vide sur une ligne pourtant faite — on coche d'abord, on
 * signe si on veut. C'est un quatrième état volontaire, et le seul.
 */
export interface DoneMark {
  readonly at: Date;
  readonly by: string;
  readonly initials: string;
}

/** Ce qu'il faut fabriquer d'un article, tous clients confondus. */
export interface ProducedItemSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** `null` = la ligne n'est pas faite. C'est le fait du FOURNIL. */
  readonly done: DoneMark | null;
}

/** L'état d'une journée, tel que l'adaptateur l'écrit et le relit. */
export interface ProductionDaySnapshot {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  /** Le dernier retirage — `null` tant que la journée porte son tirage d'origine. */
  readonly retaken: PackedMark | null;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
}
