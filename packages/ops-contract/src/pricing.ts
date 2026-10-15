/**
 * **La sonde du calcul des prix**, telle que la carte OPS la rend
 * (`documentation/ops/sonde-calcul-des-prix.md`).
 *
 * Ce que coûte le calcul lui-même, lectures en base comprises — là où le
 * trafic de la passerelle dit ce que ressent le client, réseau compris.
 * Rien de nominatif : ni client, ni article, ni prix.
 *
 * Le jugement (`state`) est rendu par le serveur ; l'écran ne recalcule rien.
 */

/** `attention` dès 80 % du seuil de p95, `exceeded` dès qu'il est atteint. */
export type PricingProbeState = "ok" | "attention" | "exceeded";

/** Une ligne : un appelant, une audience. */
export interface PricingProbeRow {
  /** Qui demande : `shelf`, `cart`, `checkout`, `back-office`. */
  readonly caller: string;
  /** `pro` ou `public`. */
  readonly audience: string;
  /** Lots résolus sur la fenêtre. */
  readonly lots: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  /** Articles par lot, en moyenne, arrondi au dixième. */
  readonly meanItems: number;
  readonly state: PricingProbeState;
}

export interface PricingProbeReport {
  readonly generatedAt: string;
  /** La fenêtre glissante, en minutes. */
  readonly windowMinutes: number;
  /** Le seuil d'alerte sur le p95, en millisecondes. */
  readonly p95ThresholdMs: number;
  /**
   * Toujours `true` aujourd'hui : chaque instance tient SA fenêtre en mémoire,
   * et avec plusieurs conteneurs l'écran n'en voit qu'une. L'écran le dit.
   */
  readonly perInstance: boolean;
  /** Les plus coûteuses (p95) d'abord ; vide quand rien n'a été résolu. */
  readonly rows: readonly PricingProbeRow[];
}
