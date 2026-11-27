import { Injectable } from "@nestjs/common";

import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import { PlannerAccess, type PlannerCaller } from "../../../channels/commerce/planner-access.js";
import {
  PlannerClosedError,
  PlannerMembershipLostError,
  PlannerProOnlyError,
} from "../../domain/errors/planned-column-errors.js";

/**
 * **Le mur du planificateur**, partagé par ses routes : une société dans
 * l'espace de la requête (pros seulement), et la personne en est membre
 * ACTUEL, puis le planificateur ouvert à cette personne (clé `orderPlanner`,
 * après exemption) — dans cet ordre, pour qu'un non-membre n'apprenne rien de
 * l'état de la clé. Rend la société, que chaque lecture et chaque écriture porte
 * ensuite dans son `where`.
 */
@Injectable()
export class PlannerWall {
  constructor(
    private readonly standing: BasketBuyerStanding,
    private readonly access: PlannerAccess,
  ) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   * @throws {PlannerClosedError} le planificateur n'est pas ouvert à cette personne.
   */
  async companyOf(
    actorUserId: string,
    companyId: string | null,
    caller: PlannerCaller,
  ): Promise<string> {
    if (companyId === null) {
      throw new PlannerProOnlyError();
    }
    if (!(await this.standing.isMember(actorUserId, companyId))) {
      const name = (await this.standing.companyName(companyId)) ?? companyId;
      throw new PlannerMembershipLostError(companyId, name);
    }
    if (!(await this.access.isOpenFor(caller))) {
      throw new PlannerClosedError();
    }
    return companyId;
  }
}
