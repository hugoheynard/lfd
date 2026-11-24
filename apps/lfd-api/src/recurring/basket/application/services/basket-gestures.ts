import { Injectable } from "@nestjs/common";

import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import type { Basket } from "../../domain/entities/basket.js";
import {
  BasketPublicPayerError,
  SubscriptionNotFoundError,
  SubscriptionSiteMembershipLostError,
} from "../../domain/errors/basket-errors.js";
import { BasketRepository } from "../../domain/ports/basket.repository.js";

/**
 * **Le mur des gestes sur un panier**, partagé par les handlers du bloc : le
 * panier est à la personne (`load`), ET, s'il est d'une société, la personne
 * en est membre ACTUEL — sans quoi quelqu'un qui a quitté la société garderait
 * la main sur le panier du site.
 */
@Injectable()
export class BasketGestures {
  constructor(
    private readonly baskets: BasketRepository,
    private readonly standing: BasketBuyerStanding,
  ) {}

  /**
   * @throws {SubscriptionNotFoundError} inconnu, arrêté, ou pas à cette personne.
   * @throws {SubscriptionSiteMembershipLostError} panier d'une société que la personne a quittée.
   */
  async loadManaged(basketId: string, actorUserId: string): Promise<Basket> {
    const basket = await this.baskets.load(basketId, actorUserId);
    if (basket === null) {
      throw new SubscriptionNotFoundError(basketId);
    }
    await this.ensureMember(basket.companyId, actorUserId);
    return basket;
  }

  /** @throws {SubscriptionSiteMembershipLostError} la personne n'est pas membre actuel de la société. */
  async ensureMember(companyId: string | null, actorUserId: string): Promise<void> {
    if (companyId === null || (await this.standing.isMember(actorUserId, companyId))) {
      return;
    }
    const name = (await this.standing.companyName(companyId)) ?? companyId;
    throw new SubscriptionSiteMembershipLostError(companyId, name);
  }

  /** @throws {BasketPublicPayerError} la société règle sur engagement budgétaire. */
  async ensureNotPublicPayer(companyId: string | null): Promise<void> {
    if (companyId === null || !(await this.standing.isPublicPayer(companyId))) {
      return;
    }
    const name = (await this.standing.companyName(companyId)) ?? companyId;
    throw new BasketPublicPayerError(companyId, name);
  }
}
