import { Injectable } from "@nestjs/common";

import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import {
  PlannerMembershipLostError,
  PlannerProOnlyError,
} from "../../domain/errors/planned-column-errors.js";

/**
 * **Le mur du planificateur**, partagé par ses routes : une société dans
 * l'espace de la requête (pros seulement), et la personne en est membre
 * ACTUEL. Rend la société, que chaque lecture et chaque écriture porte
 * ensuite dans son `where`.
 */
@Injectable()
export class PlannerWall {
  constructor(private readonly standing: BasketBuyerStanding) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   */
  async companyOf(actorUserId: string, companyId: string | null): Promise<string> {
    if (companyId === null) {
      throw new PlannerProOnlyError();
    }
    if (!(await this.standing.isMember(actorUserId, companyId))) {
      const name = (await this.standing.companyName(companyId)) ?? companyId;
      throw new PlannerMembershipLostError(companyId, name);
    }
    return companyId;
  }
}
