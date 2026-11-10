/**
 * Lit les **versions précédentes** d'une commande pour l'équipe (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification ») : chaque
 * modification, et la composition qu'elle a remplacée.
 */
export class ListOrderRevisionsQuery {
  constructor(readonly orderId: string) {}
}
