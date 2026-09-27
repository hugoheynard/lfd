import type { ShopQuotePayload, ShopQuoteView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ShopCartQuoting } from "../services/shop-cart-quoting.service.js";

/**
 * **Ce que le panier de la boutique coûte** — sans jeton, sans commande.
 *
 * Une requête : elle ne mute rien, elle répond. Le panier l'appelle à chaque
 * changement de contenu ou de mode de service, parce que le décompte dépend des
 * deux et qu'aucun des deux ne se calcule dans un navigateur.
 */
export class QuoteShopCartQuery {
  constructor(
    readonly payload: ShopQuotePayload,
    /**
     * La société pour laquelle on chiffre, ou `null` = visiteur.
     *
     * Résolue au serveur et transmise par le contrôleur — jamais reçue du
     * client. La route publique passe `null` ; la route reconnue passe ce que
     * le guard a résolu depuis les rattachements. Elle décide aussi la
     * CLIENTÈLE (remise du point, livraison ouverte) : B2B pour une société
     * active, B2C sinon.
     */
    readonly companyId: string | null = null,
    /**
     * La personne connectée, ou `null` sur la route anonyme. Seule elle peut
     * faire déduire un bon : il lui appartient (plan des points, lot C).
     */
    readonly buyerUserId: string | null = null,
  ) {}
}

/**
 * Le décompte de la vitrine, anonyme ou connecté — sans les points : le devis
 * anonyme est un contrat servi, et sa forme ne change pas (plan des points,
 * E1.2). Le devis connecté passe par `QuoteMyShopCartHandler`.
 */
@QueryHandler(QuoteShopCartQuery)
export class QuoteShopCartHandler implements IQueryHandler<QuoteShopCartQuery, ShopQuoteView> {
  constructor(private readonly quoting: ShopCartQuoting) {}

  async execute(query: QuoteShopCartQuery): Promise<ShopQuoteView> {
    // Le décompte seul : l'effet du bon n'a pas de sens sans personne, et la
    // clé n'appartient pas à ce contrat servi.
    const { view } = await this.quoting.quote(query);
    return view;
  }
}
