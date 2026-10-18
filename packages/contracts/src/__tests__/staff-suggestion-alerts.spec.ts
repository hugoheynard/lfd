import {
  STAFF_SUGGESTION_ALERT_HORIZON_DAYS,
  STAFF_SUGGESTION_ALERT_REASONS,
  STAFF_SUGGESTION_ALERT_SEVERITIES,
} from "../staff-suggestion-alerts.js";

/** Le vocabulaire fermé que l'écran et l'outil agent traduisent. */
describe("les alertes des suggestions décidées", () => {
  it("nomme quatre raisons, deux gravités, et un horizon de 31 jours", () => {
    expect(STAFF_SUGGESTION_ALERT_REASONS).toEqual([
      "withdrawn",
      "not_for_audience",
      "hidden_for_audience",
      "never_orderable",
    ]);
    expect(STAFF_SUGGESTION_ALERT_SEVERITIES).toEqual(["empty", "partial"]);
    expect(STAFF_SUGGESTION_ALERT_HORIZON_DAYS).toBe(31);
  });
});
