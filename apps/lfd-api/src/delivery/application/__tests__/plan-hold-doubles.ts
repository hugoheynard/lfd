import {
  ArrestedPlanHold,
  type PlanHoldState,
} from "../../../production/channels/delivery/index.js";

/**
 * Le verrou partagé du fournil, doublé : rend l'état posé par le test et note
 * chaque journée tenue, avec le journal d'appels qu'on lui passe — l'ordre
 * « tenir, puis écrire » est le sujet.
 */
export class ScriptedPlanHold extends ArrestedPlanHold {
  constructor(
    private readonly state: PlanHoldState = "never_arrested",
    private readonly log: string[] = [],
  ) {
    super();
  }

  hold(serviceDay: string): Promise<PlanHoldState> {
    this.log.push(`hold ${serviceDay}`);
    return Promise.resolve(this.state);
  }
}
