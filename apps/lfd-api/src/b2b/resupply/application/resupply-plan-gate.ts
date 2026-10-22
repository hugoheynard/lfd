import { Injectable } from "@nestjs/common";

import {
  LaunchedResupplies,
  PlanAdmissionDesk,
  ServiceDay,
} from "../../../production/channels/commerce/index.js";
import type { ResupplyTarget } from "../domain/site-resupply.js";

/**
 * **Le guichet d'admission du plan, pour le réassort** (lot R3a,
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md` §13.3) — la
 * même figure qu'`OrderPlanGate` pour une commande.
 *
 * L'envoi et l'annulation d'un réassort « pour demain » prennent le verrou de
 * la journée (`production_day:<jour>`) dans LEUR unité de travail, puis
 * lisent l'arrêt ; l'arrêt du plan prend ce verrou avant de lire les
 * réassorts. L'envoi voit l'arrêt, ou l'arrêt voit l'envoi — jamais aucun des
 * deux ; de même pour l'annulation. « Au plus tôt » n'entre au plan que
 * LANCÉ par le fournil (R4a) : son annulation demande au fournil, sous le même
 * verrou, s'il l'est ({@link launched}).
 *
 * Il CONSTATE, il ne décide pas : refuser est la règle de l'agrégat
 * (`SiteResupply.place`, `SiteResupply.cancel`).
 */
@Injectable()
export class ResupplyPlanGate {
  constructor(
    private readonly desk: PlanAdmissionDesk,
    private readonly launches: LaunchedResupplies,
  ) {}

  /**
   * Verrouille la journée jusqu'à la fin de l'unité de travail EN COURS, puis
   * dit si son plan est arrêté. À appeler dans la transaction qui écrit le
   * réassort, avant elle.
   */
  async hold(target: ResupplyTarget, serviceDay: string): Promise<boolean> {
    if (target !== "tomorrow") {
      return false;
    }
    return (await this.desk.admit(ServiceDay.of(serviceDay))) === "closed";
  }

  /**
   * R4a — verrouille la journée jusqu'à la fin de l'unité de travail EN
   * COURS, puis dit si le fournil a lancé ce réassort « au plus tôt ». Le
   * lancement prend le même verrou : l'annulation voit le lancement, ou le
   * lancement voit l'annulation. Un « pour demain » ne se lance jamais.
   */
  async launched(target: ResupplyTarget, serviceDay: string, resupplyId: string): Promise<boolean> {
    if (target !== "asap") {
      return false;
    }
    return this.launches.isLaunched(ServiceDay.of(serviceDay), resupplyId);
  }
}
