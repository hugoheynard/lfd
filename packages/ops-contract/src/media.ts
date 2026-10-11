/**
 * **Les seuils de la médiathèque**, tels que la carte OPS les rend.
 *
 * Un seuil n'est pas une panne : c'est une limite connue d'avance, écrite dans
 * la documentation, qu'on approche sans bruit — le fonds grossit d'une image à
 * la fois. La surveiller, c'est voir venir le jour où un geste devient
 * nécessaire, plutôt que l'apprendre par un refus ou par une facture.
 *
 * Le jugement (`state`) est rendu par le serveur, pur et testé ; l'écran ne
 * recalcule rien.
 */

/** `attention` dès 80 % de la limite, `exceeded` dès qu'elle est atteinte. */
export type MediaThresholdState = "ok" | "attention" | "exceeded";

/** Les limites surveillées. Une clé, pas un libellé : l'écran peut les ranger. */
export type MediaThresholdKey = "ranked-sort" | "palette-strip" | "transformations";

export interface MediaThreshold {
  readonly key: MediaThresholdKey;
  readonly label: string;
  /** La grandeur mesurée — ou estimée, et alors `estimated` le dit. */
  readonly measured: number;
  readonly limit: number;
  readonly unit: string;
  readonly estimated: boolean;
  readonly state: MediaThresholdState;
  /** Ce que veut dire l'état, et le geste de sortie quand il y en a un. */
  readonly message: string;
  /** Où la limite est écrite — c'est là qu'on la conteste. */
  readonly source: string;
}

export interface MediaThresholdsReport {
  readonly generatedAt: string;
  /** Les images au fonds : la borne supérieure de toute lecture filtrée. */
  readonly images: number;
  readonly thresholds: readonly MediaThreshold[];
}
