/** Les entités émettrices, toutes — il y en aura une ou deux. */
export class ListLegalEntitiesQuery {}

export class GetLegalEntityQuery {
  constructor(readonly legalEntityId: string) {}
}

/**
 * La fiche de mandat SEPA préremplie de notre bloc créancier — un EXEMPLE, sans
 * débiteur ni RUM.
 *
 * C'est une **lecture** : elle ne crée aucun mandat, n'écrit rien, et n'attribue
 * pas de référence. Deux appels rendent le même fichier au bit près. Le jour où
 * un mandat nominatif existera, il sera l'objet d'une commande — parce que
 * frapper une RUM, lui, est un fait qu'on garde.
 */
export class ExportSampleMandateQuery {
  constructor(readonly legalEntityId: string) {}
}
