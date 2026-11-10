/**
 * Query : les points de retrait d'un client reconnu, tels que la boutique les
 * montre — ceux de sa clientèle, avec la remise de son audience **établie**
 * (pro actif, pro en attente, particulier) et elle seule (plan
 * `chaque-audience-son-information`, § 5.1). `null` : l'espace perso.
 */
export class ListMyShopPickupsQuery {
  constructor(readonly companyId: string | null) {}
}
