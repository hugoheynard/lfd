import {
  ArrestedPlanHold,
  type PlanHoldState,
} from "../../../production/channels/packing/index.js";

/**
 * Le verrou partagé du fournil, doublé : rend l'état du plan posé par le test,
 * et retient les journées tenues, dans l'ordre.
 */
export class RecordingPlanHold extends ArrestedPlanHold {
  readonly held: string[] = [];

  constructor(private readonly arrested: boolean = true) {
    super();
  }

  /** Un plan rouvert : chaque geste doit refuser. */
  static reopened(): RecordingPlanHold {
    return new RecordingPlanHold(false);
  }

  hold(serviceDay: string): Promise<PlanHoldState> {
    this.held.push(serviceDay);
    return Promise.resolve(this.arrested ? "arrested" : "reopened");
  }
}
