import {
  type DayDueThresholds,
  DueThresholdsReader,
} from "../../channels/commerce/due-thresholds.reader.js";

/** Le commerce sans besoin daté : aucune marge, aucun seuil. */
export const NO_DUE: DayDueThresholds = {
  deliveryMarginMinutes: null,
  pickupMarginMinutes: null,
  items: [],
};

/** Les besoins du jour doublés : une réponse fixe, ou une panne du commerce. */
export class FixedDueThresholds extends DueThresholdsReader {
  constructor(private readonly due: DayDueThresholds | "down" = NO_DUE) {
    super();
  }

  dueThresholdsFor(): Promise<DayDueThresholds> {
    return this.due === "down"
      ? Promise.reject(new Error("commerce injoignable"))
      : Promise.resolve(this.due);
  }
}
