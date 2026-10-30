/**
 * Marque un article « sur mesure », ou l'en démarque (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a). Le
 * marqueur affiche ; il ne restreint rien chez les pros (S4).
 */
export class SetMadeToOrderCommand {
  constructor(
    readonly sku: string,
    readonly madeToOrder: boolean,
  ) {}
}
