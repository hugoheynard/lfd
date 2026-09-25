import { Injectable } from "@nestjs/common";

import { SaleOperations } from "../../../catalog/application/sale-operations.service.js";
import { ensureWithinOperation } from "../../domain/services/order-operation-guard.js";

/**
 * **Le garde des opérations datées, pour la caisse et le devis** (D6 de
 * `documentation/order/architecture-operations-datees.md`).
 *
 * Un service plutôt qu'un bloc dans `OrderDrafting`, pour que le devis de la
 * boutique, celui du staff et la passation opposent LA même règle : trois
 * copies de « qui est pro, quel jour, quel refus » finiraient par dire trois
 * choses.
 *
 * 🔴 **La clientèle vient de la COMMANDE** : une société ⇒ `pro`, sinon
 * `public` — la déduction même d'`OrderLinePricing`, qui tarife ce panier. Une
 * bûche de Noël réservée aux professionnels ne passe donc pas par la boutique
 * publique, alors que le garde de délai lit toujours en `pro` (son
 * commentaire dit pourquoi, et il ne change pas ici).
 */
@Injectable()
export class OrderOperations {
  constructor(private readonly sale: SaleOperations) {}

  /**
   * Refuse le panier si l'une de ses lignes ne passe pas.
   *
   * @param fulfillmentDate le jour demandé ; `null` = la commande n'en porte
   *   pas (refusé pour un article `operationOnly`) ; absent = un devis, qui ne
   *   juge pas le jour mais dit déjà « pas encore ouvert », « clos » ou
   *   « introuvable » — le refus n'attend pas le paiement.
   * @throws cf. `ensureWithinOperation`.
   */
  async ensure(
    lines: readonly { readonly sku: string }[],
    companyId: string | null,
    fulfillmentDate?: string | null,
  ): Promise<void> {
    const skus = [...new Set(lines.map((line) => line.sku))];
    const audience = companyId === null ? "public" : "pro";
    const accesses = await this.sale.accessOf(skus, audience, fulfillmentDate);
    ensureWithinOperation(
      skus.flatMap((sku) => {
        const found = accesses.get(sku);
        return found === undefined
          ? []
          : [{ sku, productName: found.productName, access: found.access }];
      }),
    );
  }
}
