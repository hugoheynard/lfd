/**
 * Les deux couleurs de livraison (`#rrggbb`), une par clientèle ; `null` :
 * couleur non posée — le papier n'imprime alors rien, jamais une teinte
 * devinée.
 */
export interface DeliveryColors {
  readonly pro: string | null;
  readonly public: string | null;
}

/**
 * **Les couleurs de livraison du site de départ** — ce que la feuille de
 * tournée imprime en tête de chaque arrêt (plan
 * `commandes/back-office/tri-depart-et-couleurs.md`, L5). Déclaré par la livraison,
 * implémenté par le commerce (`b2b/sites/`), relié dans `appBootstrap`.
 *
 * Lues À CHAQUE TIRAGE, jamais figées : un changement en Réglages › Sites se
 * voit au tirage suivant (Hugo, 2026-10-13). Le site de départ est celui que
 * la livraison résout AUJOURD'HUI (`DepartureSiteReader`) — un seul départ ;
 * plusieurs départs demanderont que la tournée retienne le sien.
 *
 * Port à lui (ISP) : le papier ne lit ni l'adresse, ni les rôles, ni les
 * couleurs de retrait — les arrêts d'une tournée sont des livraisons.
 */
export abstract class DeliveryColorsReader {
  /** Sans site de départ, ou départ inconnu du commerce : deux `null`. */
  abstract departureColors(): Promise<DeliveryColors>;
}
