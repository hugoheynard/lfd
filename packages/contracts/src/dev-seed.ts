/**
 * Contrat de fil du **rechargement du jeu de données de développement**.
 *
 * Il vit dans le contrat comme n'importe quel autre fil : deux applications se
 * parlent, donc la forme leur appartient à toutes les deux. Le fait qu'il
 * n'existe qu'en développement ne change rien à cette règle — c'est le seul
 * endroit où une divergence entre l'API et l'écran se verrait à la compilation.
 *
 * ⚠️ Ce sont des **types** : ils disparaissent à la compilation, et n'ajoutent
 * donc rien au bundle de production, même si l'écran qui les lit en est absent.
 */

/** Ce que la coupe a emporté. */
export interface DevSeedResetReport {
  readonly companies: number;
  readonly people: number;
  readonly pickupPoints: number;
  readonly zones: number;
}

/** Ce que le semis a posé, et les deux journées qui font l'invariant. */
export interface DevSeedOrdersReport {
  readonly removed: number;
  readonly placed: number;
  /** `AAAA-MM-JJ` — la journée servie la veille. */
  readonly yesterday: string;
  /** `AAAA-MM-JJ` — celle des deux commandes en attente. */
  readonly tomorrow: string;
}

/**
 * Ce qu'un bucket de développement a rendu.
 *
 * Le rechargement supprime les commandes ; sans lui, les bons déjà tirés
 * restaient en magasin sous des identifiants qui n'existaient plus. Pire, un bon
 * archivé est servi TEL QUEL au téléchargement suivant : un poste gardait le
 * vieux dessin sur une commande neuve.
 */
export interface DevSeedStorageReport {
  readonly bucket: string;
  readonly objects: number;
}

/** La réponse de `POST /admin/dev/seed/reload`. */
export interface DevSeedReport {
  readonly reset: DevSeedResetReport;
  readonly orders: DevSeedOrdersReport;
  /** Vide si aucun bucket n'est configuré sur ce poste. */
  readonly storage: readonly DevSeedStorageReport[];
}
