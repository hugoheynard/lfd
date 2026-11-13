/**
 * **Les remises du jour, vues du cockpit commercial** — des chiffres, aucune ligne.
 *
 * Une route par usage (décidé par Hugo le 2026-11-13) : le tableau de bord du
 * commercial ne montre que deux compteurs par acheminement ; il ne reçoit donc
 * ni les commandes, ni les clients, ni les tournées de la file du comptoir.
 * Ce qui n'est pas dans la vue ne traverse pas le réseau.
 */
export interface CockpitHandoverSplitView {
  /** Les remises attendues par cette voie ce jour-là, annulées exclues. */
  readonly expected: number;
  /** Celles déjà faites — le reste est encore à tendre ou à charger. */
  readonly done: number;
}

/**
 * Les deux voies ne se comptent pas ensemble : un retrait attend qu'un client
 * passe, un coursier part d'ici. Un total unique masquerait la question de la
 * fin de journée.
 */
export interface CockpitHandoversView {
  /** Le jour demandé, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly pickup: CockpitHandoverSplitView;
  readonly delivery: CockpitHandoverSplitView;
}
