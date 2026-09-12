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

/**
 * Les octets du **logo** d'une entité, pour les servir à l'écran.
 *
 * Elle prend l'identifiant de l'ENTITÉ, jamais la clé de stockage : c'est la
 * différence entre « montre-moi le logo de cette entité » et « sers-moi cet
 * objet-là », et la seconde formulation est celle qui finit par servir n'importe
 * quel objet du bucket.
 */
export class GetLegalEntityLogoQuery {
  constructor(readonly legalEntityId: string) {}
}
