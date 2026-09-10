/**
 * Le cycle en cours.
 *
 * Une **lecture** : elle ne clôture rien et n'écrit rien. Clôturer est un fait
 * qu'on garde, donc ce sera une commande — et le jour où les clôtures seront
 * enregistrées, c'est le handler qui les lira, pas cette classe qui changera.
 */
export class GetCurrentBillingCycleQuery {}

/**
 * Le **brouillon** de fichier de prélèvement pour le cycle en cours.
 *
 * Une lecture : rien n'est clôturé, aucun lot n'est créé, aucune commande n'est
 * marquée. Deux appels rendent le même fichier — c'est ce qui permet de le
 * relire avec un conseiller sans rien engager.
 *
 * L'entité émettrice est **demandée**, jamais devinée : le jour où il y en a
 * deux, choisir en silence prélèverait sous le mauvais ICS.
 */
export class ExportCycleDraftQuery {
  constructor(readonly legalEntityId: string) {}
}

/**
 * Le **contrôle** du brouillon : un CSV lu depuis le XML, pas à côté.
 *
 * Une seconde requête plutôt qu'un champ de la première : on télécharge l'un OU
 * l'autre, et rendre les deux ensemble ferait fabriquer un CSV à chaque
 * téléchargement de XML.
 */
export class ExportCycleAuditQuery {
  constructor(readonly legalEntityId: string) {}
}
