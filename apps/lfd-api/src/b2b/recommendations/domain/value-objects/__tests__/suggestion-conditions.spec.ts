import {
  InvalidSuggestionCartThresholdError,
  InvalidSuggestionHourError,
  InvalidSuggestionSitesError,
  InvalidSuggestionWeekdaysError,
  SuggestionCartConditionPlacementError,
  SuggestionHoursReversedError,
} from "../../errors/suggestion-condition-errors.js";
import {
  hoursCover,
  MAX_SUGGESTION_CART_THRESHOLD_CENTS,
  MAX_SUGGESTION_SITES,
  NO_SUGGESTION_CONDITIONS,
  suggestionConditions,
  type SuggestionConditionsInput,
} from "../suggestion-conditions.js";

function judge(over: Partial<SuggestionConditionsInput>, placement: "cart" | "home" = "cart") {
  return suggestionConditions({ ...NO_SUGGESTION_CONDITIONS, ...over }, placement);
}

describe("suggestionConditions", () => {
  it("aucune condition : tout reste à null", () => {
    expect(judge({})).toEqual(NO_SUGGESTION_CONDITIONS);
  });

  it("les jours : rangés du lundi au dimanche ; les sept valent « tous »", () => {
    expect(judge({ weekdays: ["fri", "mon"] }).weekdays).toEqual(["mon", "fri"]);
    expect(
      judge({ weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }).weekdays,
    ).toBeNull();
  });

  it("les jours : refuse une liste vide, un jour inconnu, un doublon", () => {
    expect(() => judge({ weekdays: [] })).toThrow(InvalidSuggestionWeekdaysError);
    expect(() => judge({ weekdays: ["lundi"] })).toThrow(InvalidSuggestionWeekdaysError);
    expect(() => judge({ weekdays: ["mon", "mon"] })).toThrow(InvalidSuggestionWeekdaysError);
  });

  it("la plage : début avant fin, à la minute près ; pas de plage qui passe minuit", () => {
    expect(judge({ hours: { from: "07:00", to: "07:01" } }).hours).toEqual({
      from: "07:00",
      to: "07:01",
    });
    expect(() => judge({ hours: { from: "07:00", to: "07:00" } })).toThrow(
      SuggestionHoursReversedError,
    );
    expect(() => judge({ hours: { from: "22:00", to: "02:00" } })).toThrow(
      SuggestionHoursReversedError,
    );
  });

  it("la plage : refuse une heure mal formée", () => {
    expect(() => judge({ hours: { from: "7:00", to: "11:00" } })).toThrow(
      InvalidSuggestionHourError,
    );
    expect(() => judge({ hours: { from: "07:00", to: "24:00" } })).toThrow(
      InvalidSuggestionHourError,
    );
  });

  it("le seuil : un centime à 10 000 €, entier", () => {
    expect(judge({ minCartTotalCents: 1 }).minCartTotalCents).toBe(1);
    expect(
      judge({ minCartTotalCents: MAX_SUGGESTION_CART_THRESHOLD_CENTS }).minCartTotalCents,
    ).toBe(MAX_SUGGESTION_CART_THRESHOLD_CENTS);
    for (const refused of [0, -100, 12.5, MAX_SUGGESTION_CART_THRESHOLD_CENTS + 1]) {
      expect(() => judge({ minCartTotalCents: refused })).toThrow(
        InvalidSuggestionCartThresholdError,
      );
    }
  });

  it("le seuil et la famille exclue ne se posent qu'au panier", () => {
    expect(() => judge({ minCartTotalCents: 2_000 }, "home")).toThrow(
      SuggestionCartConditionPlacementError,
    );
    expect(() => judge({ cartWithoutFamilyId: "fam-boissons" }, "home")).toThrow(
      SuggestionCartConditionPlacementError,
    );
    expect(judge({ weekdays: ["mon"] }, "home").weekdays).toEqual(["mon"]);
  });

  it("la famille exclue : rognée, et vide vaut aucune", () => {
    expect(judge({ cartWithoutFamilyId: "  fam-boissons " }).cartWithoutFamilyId).toBe(
      "fam-boissons",
    );
    expect(judge({ cartWithoutFamilyId: "  " }).cartWithoutFamilyId).toBeNull();
  });

  it("les points de retrait : au moins un, distincts, bornés", () => {
    expect(judge({ pickupAddressIds: [" site-a ", "site-b"] }).pickupAddressIds).toEqual([
      "site-a",
      "site-b",
    ]);
    expect(() => judge({ pickupAddressIds: [] })).toThrow(InvalidSuggestionSitesError);
    expect(() => judge({ pickupAddressIds: ["site-a", "site-a"] })).toThrow(
      InvalidSuggestionSitesError,
    );
    const tooMany = Array.from({ length: MAX_SUGGESTION_SITES + 1 }, (_, i) => `site-${i}`);
    expect(() => judge({ pickupAddressIds: tooMany })).toThrow(InvalidSuggestionSitesError);
  });
});

describe("hoursCover", () => {
  const morning = { from: "07:00", to: "11:00" };

  it("début compris, fin exclue", () => {
    expect(hoursCover(morning, "06:59")).toBe(false);
    expect(hoursCover(morning, "07:00")).toBe(true);
    expect(hoursCover(morning, "10:59")).toBe(true);
    expect(hoursCover(morning, "11:00")).toBe(false);
  });
});
