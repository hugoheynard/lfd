import type { CustomerShelfPricesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { RecognisedShelf } from "../../../catalog/application/recognised-shelf.service.js";
import { shelfPriceOf } from "./read-customer-shelf-prices.js";

/**
 * **Le rayon d'un particulier, pour la saisie du comptoir**
 * (`commande-particulier-reglee-en-boutique.md`, § 5 : ne pas mélanger
 * les prix des deux clientèles).
 *
 * La table ne recalcule rien : elle lit le MÊME rayon, sous la MÊME clé et au
 * même cache que la route reconnue d'un particulier connecté
 * (`read-my-shop-catalogue.ts`). Pour lui, `@ActingCompany` résout `null` — un
 * particulier n'a pas de société —, et le rayon est alors celui du public :
 * le TTC d'étiquette, les promotions publiques, aucun article réservé ni sur
 * mesure. Tous les particuliers voient donc le même rayon ; la requête ne
 * porte pas la personne, qui ne changerait rien.
 *
 * Le rayon de la boutique ne dépend ni du point de retrait ni du jour : il
 * est calculé à l'instant de la lecture, comme celui que le client verrait en
 * ouvrant son espace. Le devis du panier, lui, juge le jour et le point.
 */
export class ReadCounterParticularShelfPricesQuery {}

@QueryHandler(ReadCounterParticularShelfPricesQuery)
export class ReadCounterParticularShelfPricesHandler implements IQueryHandler<
  ReadCounterParticularShelfPricesQuery,
  CustomerShelfPricesView
> {
  constructor(private readonly shelf: RecognisedShelf) {}

  async execute(): Promise<CustomerShelfPricesView> {
    const view = await this.shelf.read(null);
    return { items: view.items.map(shelfPriceOf), audience: "public" };
  }
}
