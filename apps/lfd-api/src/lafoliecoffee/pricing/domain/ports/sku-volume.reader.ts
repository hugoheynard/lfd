/**
 * Une fenêtre d'observation : borne basse **incluse**, borne haute **exclue**.
 *
 * Mêmes bornes que partout ailleurs dans ce contexte (les fenêtres de validité
 * des règles). Deux conventions de bornes dans le même domaine finiraient par se
 * croiser sur une commande de minuit pile.
 */
export interface VolumeWindow {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Port de lecture du **volume vendu**, par SKU et par fenêtre.
 *
 * Il sert deux questions qui n'ont pas la même urgence : « ce client a-t-il
 * atteint le volume qui déverrouille le tarif bas ? » sur le chemin qui facture,
 * et « cette remise a-t-elle produit son effet ? » sur l'écran de tarification.
 * Une seule méthode, **par lot**, pour que la seconde ne puisse pas dégénérer en
 * une requête par article — le catalogue en compte quatre-vingt-douze.
 *
 * Ce que le port **ne** fait pas : décider. Il rend des quantités ; c'est le
 * domaine qui en tire un ratio, un objectif et un verdict.
 */
export abstract class SkuVolumeReader {
  /**
   * Les quantités vendues par SKU sur la fenêtre.
   *
   * Un SKU sans vente est **absent** de la table plutôt que présent à zéro :
   * l'appelant doit distinguer « aucune vente » de « pas demandé », et une
   * entrée à zéro rendrait les deux identiques.
   */
  abstract volumesFor(
    skus: readonly string[],
    window: VolumeWindow,
  ): Promise<ReadonlyMap<string, number>>;
}
