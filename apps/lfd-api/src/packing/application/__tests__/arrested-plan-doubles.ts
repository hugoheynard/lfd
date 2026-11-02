import {
  ArrestedPlanHold,
  type PlanHoldState,
} from "../../../production/channels/packing/index.js";

/**
 * Le verrou partagé du fournil, doublé : rend l'état du plan posé par le test.
 */
export class RecordingPlanHold extends ArrestedPlanHold {
  constructor(private readonly arrested: boolean = true) {
    super();
  }

  /** Un plan rouvert : chaque geste doit refuser. */
  static reopened(): RecordingPlanHold {
    return new RecordingPlanHold(false);
  }

  hold(_serviceDay: string): Promise<PlanHoldState> {
    return Promise.resolve(this.arrested ? "arrested" : "reopened");
  }
}
