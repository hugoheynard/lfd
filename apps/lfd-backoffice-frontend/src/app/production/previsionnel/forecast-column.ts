/**
 * **Une colonne de la table du prévisionnel**, quelle que soit sa nature.
 *
 * La table a d'abord eu une colonne PAR JOUR (`ForecastHeader`) ; depuis le
 * 2026-11-01, elle rend aussi une journée PAR TRANCHE. Plutôt que de faire
 * passer une tranche pour un faux jour, la table ne lit plus que ce type
 * neutre, et chaque lecture a sa fabrique (`dayColumns`, `trancheColumns`).
 */
export interface ForecastColumn {
  /** Unique dans la table : la date, ou la clé de la tranche. */
  readonly key: string;
  /** La ligne courte au-dessus du titre (« J+2 · pic ») — `null` si rien à dire. */
  readonly overline: string | null;
  /** « jeu. 3 sept. », « avant 05:00 ». */
  readonly title: string;
  /** Une qualification sous le titre (« réassorts compris ») — `null` sinon. */
  readonly subtitle: string | null;
  /** Le total de la colonne, déjà écrit — vide pour zéro. */
  readonly figure: string;
  /** Le mot qui nomme l'état (« Arrêté », « Dépassée · 11 min ») — `null` sinon. */
  readonly mention: string | null;
  /** `true` = le chiffre est un fait ; `false` = une prévision qui bougera (encre atténuée). */
  readonly settled: boolean;
  /** La seule colonne teintée de la table, quand il y en a une. */
  readonly peak: boolean;
  /** La surcouche de la colonne entière, de la tête au pied — `null` = aucune. */
  readonly tone: ForecastColumnTone | null;
  /** Les valeurs du pied, alignées sur les `ForecastFootRow` de la table. */
  readonly foot: readonly string[];
}

/**
 * Les surcouches de colonne, nommées par ce qu'elles DESSINENT : une alerte,
 * l'accent du moment, le passé grisé, une journée qui n'existe pas (rayée).
 */
export type ForecastColumnTone = 'overdue' | 'current' | 'past' | 'closedDay';

/**
 * Une ligne du pied. `total` est le verdict (gros chiffre, barre d'état) ;
 * `detail` le qualifie en petit ; `resupplies` est un détail teinté (R3d).
 */
export interface ForecastFootRow {
  /** Repère stable, posé en `data-foot` sur chaque case de la ligne. */
  readonly key: string;
  readonly label: string;
  readonly kind: 'total' | 'detail' | 'resupplies';
}
