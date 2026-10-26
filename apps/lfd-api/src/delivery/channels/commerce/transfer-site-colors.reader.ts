/**
 * **La couleur de transfert des sites** — le carré posé devant un transfert
 * dans la répartition du dossier des tournées (décision de Hugo du
 * 2026-10-26 : « avec sa couleur, comme sur les autres papiers »). C'est la
 * teinte `transfer` que Réglages › Sites pose sur chaque site, que la
 * livraison ne connaît pas : DÉCLARÉ ici, IMPLÉMENTÉ par le commerce, relié
 * dans `appBootstrap`.
 *
 * Distinct de `TransferOrderColorsReader` (une pastille par COMMANDE portée,
 * la règle du bon) : ici une teinte par SITE. Deux lecteurs, deux raisons de
 * changer. Lue à chaque tirage, jamais figée.
 */
export abstract class TransferSiteColorsReader {
  /** Par site, sa couleur de transfert (`#rrggbb`) ; un site sans couleur, ou inconnu, est ABSENT. */
  abstract colorsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
