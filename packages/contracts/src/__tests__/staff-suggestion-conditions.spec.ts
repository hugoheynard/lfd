import { staffSuggestionRulePayloadSchema } from "../staff-suggestions.js";
import {
  NO_STAFF_SUGGESTION_CONDITIONS,
  STAFF_SUGGESTION_WEEKDAYS,
  staffSuggestionConditionsSchema,
} from "../staff-suggestion-conditions.js";

/** La forme seule : l'ordre des heures, le seuil et l'existence se jugent dans le commerce. */
describe("staffSuggestionConditionsSchema", () => {
  const ok = (body: unknown) => staffSuggestionConditionsSchema.safeParse(body).success;

  it("admet l'absence de toute condition, et chacune posée", () => {
    expect(ok(NO_STAFF_SUGGESTION_CONDITIONS)).toBe(true);
    expect(
      ok({
        weekdays: ["mon", "fri"],
        hours: { from: "07:00", to: "11:00" },
        minCartTotalCents: 2_000,
        cartWithoutFamilyId: "fam-boissons",
        pickupAddressIds: ["site-a"],
      }),
    ).toBe(true);
  });

  it("refuse un jour inconnu, un montant non entier, un champ manquant ou inconnu", () => {
    expect(ok({ ...NO_STAFF_SUGGESTION_CONDITIONS, weekdays: ["lundi"] })).toBe(false);
    expect(ok({ ...NO_STAFF_SUGGESTION_CONDITIONS, minCartTotalCents: 20.5 })).toBe(false);
    expect(ok({ weekdays: null })).toBe(false);
    expect(ok({ ...NO_STAFF_SUGGESTION_CONDITIONS, segment: "vip" })).toBe(false);
  });

  it("la semaine commence le lundi", () => {
    expect(STAFF_SUGGESTION_WEEKDAYS[0]).toBe("mon");
    expect(STAFF_SUGGESTION_WEEKDAYS).toHaveLength(7);
  });
});

describe("staffSuggestionRulePayloadSchema — RS8", () => {
  const rule = {
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["BOI-001"],
    placement: "cart",
    audience: "both",
    startsOn: "2026-10-18",
    endsOn: "2026-10-25",
    phrase: null,
    priority: 0,
  };

  it("un client d'avant RS8 n'envoie pas de conditions : toujours admis", () => {
    expect(staffSuggestionRulePayloadSchema.safeParse(rule).success).toBe(true);
    expect(
      staffSuggestionRulePayloadSchema.safeParse({
        ...rule,
        conditions: NO_STAFF_SUGGESTION_CONDITIONS,
      }).success,
    ).toBe(true);
  });
});
