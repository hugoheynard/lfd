/**
 * Les deux couleurs de livraison (`#rrggbb`), une par clientèle ; `null` :
 * couleur non posée — aucun carré n'est imprimé, jamais une teinte devinée.
 */
export interface RunSheetDeliveryColors {
  readonly pro: string | null;
  readonly public: string | null;
}

/**
 * **Les couleurs de livraison du site de départ, pour la feuille de route**
 * (plan `commandes/back-office/plan-tri-depart-et-couleurs.md`, L5). Déclaré par le
 * retrait, implémenté par le commerce (`b2b/sites/`), relié dans
 * `appBootstrap`.
 *
 * La feuille s'ouvre sous `delivery_run_sheet`, qui n'ouvre pas la palette de
 * l'écran : c'est donc le serveur qui y pose la couleur de chaque arrêt, lue
 * à chaque lecture — jamais figée. Un port à lui, jumeau de celui de la
 * livraison : chaque bloc déclare ce qu'il lit, aucun n'importe l'autre.
 */
export abstract class RunSheetColorsReader {
  /** Sans site de départ, ou départ inconnu du commerce : deux `null`. */
  abstract departureColors(): Promise<RunSheetDeliveryColors>;
}
