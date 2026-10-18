import {
  DuplicateSuggestedSkuError,
  InvalidSuggestionDayError,
  InvalidSuggestionPhraseError,
  InvalidSuggestionPriorityError,
  SuggestedCountError,
  SuggestedEqualsTriggerError,
  SuggestionPeriodOverError,
  SuggestionPeriodReversedError,
  SuggestionPlacementMismatchError,
  SuggestionRuleArchivedError,
  SuggestionTriggerRefError,
  UnknownSuggestionAudienceError,
  UnknownSuggestionPlacementError,
  UnknownSuggestionTriggerError,
} from "../../errors/staff-suggestion-errors.js";
import { StaffSuggestionRule, type StaffSuggestionRuleInput } from "../staff-suggestion-rule.js";
import { NO_SUGGESTION_CONDITIONS } from "../../value-objects/suggestion-conditions.js";
import {
  SuggestionCartConditionPlacementError,
  SuggestionFamilyContradictionError,
} from "../../errors/suggestion-condition-errors.js";

/**
 * Les jours ne sont comparés qu'à `TODAY`, passé en argument : la fixture ne
 * dépend d'aucune horloge.
 */
const TODAY = "2026-10-18";
const STAMP = { by: "staff_1", at: new Date("2026-10-18T08:00:00.000Z") };
const LATER = { by: "staff_2", at: new Date("2026-10-19T08:00:00.000Z") };

function input(over: Partial<StaffSuggestionRuleInput> = {}): StaffSuggestionRuleInput {
  return {
    trigger: { kind: "product_in_cart", ref: "VIE-001" },
    suggestedSkus: ["BOI-001"],
    placement: "cart",
    audience: "both",
    startsOn: "2026-10-18",
    endsOn: "2026-10-25",
    phrase: { fr: "Avec un croissant, le café du matin" },
    priority: 0,
    conditions: NO_SUGGESTION_CONDITIONS,
    ...over,
  };
}

const declare = (over: Partial<StaffSuggestionRuleInput> = {}) =>
  StaffSuggestionRule.declare("rule_1", input(over), STAMP, TODAY);

describe("StaffSuggestionRule — déclarer", () => {
  it("naît allumée, signée, et dit l'emplacement de ses compteurs en minuscules", () => {
    const rule = StaffSuggestionRule.declare("01JABCDEF", input(), STAMP, TODAY);
    expect(rule.snapshot()).toMatchObject({
      id: "01JABCDEF",
      active: true,
      archivedAt: null,
      created: STAMP,
      lastWrite: STAMP,
      suggestedSkus: ["BOI-001"],
      period: { startsOn: "2026-10-18", endsOn: "2026-10-25" },
    });
    expect(rule.audienceKey).toBe("01jabcdef");
  });

  it("accepte « partout » sans référence, à tout emplacement", () => {
    for (const placement of ["cart", "product", "home"]) {
      expect(() =>
        declare({ trigger: { kind: "everywhere", ref: null }, placement }),
      ).not.toThrow();
    }
  });

  it("refuse un déclencheur inconnu", () => {
    expect(() => declare({ trigger: { kind: "anywhere", ref: null } })).toThrow(
      UnknownSuggestionTriggerError,
    );
  });

  it("refuse « partout » qui nomme un article, et un article au panier qui n'en nomme pas", () => {
    expect(() => declare({ trigger: { kind: "everywhere", ref: "VIE-001" } })).toThrow(
      SuggestionTriggerRefError,
    );
    expect(() => declare({ trigger: { kind: "product_in_cart", ref: "  " } })).toThrow(
      SuggestionTriggerRefError,
    );
    expect(() => declare({ trigger: { kind: "category_in_cart", ref: null } })).toThrow(
      SuggestionTriggerRefError,
    );
  });

  it("refuse un emplacement inconnu", () => {
    expect(() => declare({ placement: "footer" })).toThrow(UnknownSuggestionPlacementError);
  });

  it("refuse une fiche ouverte au panier, et un panier en fiche", () => {
    expect(() =>
      declare({ trigger: { kind: "product_viewed", ref: "VIE-001" }, placement: "cart" }),
    ).toThrow(SuggestionPlacementMismatchError);
    expect(() =>
      declare({ trigger: { kind: "category_in_cart", ref: "cat_1" }, placement: "home" }),
    ).toThrow(SuggestionPlacementMismatchError);
  });

  it("refuse aucun article suggéré, ou plus de trois", () => {
    expect(() => declare({ suggestedSkus: [] })).toThrow(SuggestedCountError);
    expect(() => declare({ suggestedSkus: [" "] })).toThrow(SuggestedCountError);
    expect(() => declare({ suggestedSkus: ["A", "B", "C", "D"] })).toThrow(SuggestedCountError);
  });

  it("refuse un article suggéré deux fois", () => {
    expect(() => declare({ suggestedSkus: ["BOI-001", " BOI-001"] })).toThrow(
      DuplicateSuggestedSkuError,
    );
  });

  it("refuse de suggérer l'article qui déclenche", () => {
    expect(() => declare({ suggestedSkus: ["BOI-001", "VIE-001"] })).toThrow(
      SuggestedEqualsTriggerError,
    );
  });

  it("refuse une audience inconnue", () => {
    expect(() => declare({ audience: "tous" })).toThrow(UnknownSuggestionAudienceError);
  });

  it("refuse un jour mal formé ou qui n'existe pas", () => {
    expect(() => declare({ startsOn: "18/10/2026" })).toThrow(InvalidSuggestionDayError);
    expect(() => declare({ endsOn: "2027-02-30" })).toThrow(InvalidSuggestionDayError);
  });

  it("refuse une fin avant le début, accepte une période d'un jour", () => {
    expect(() => declare({ startsOn: "2026-10-25", endsOn: "2026-10-20" })).toThrow(
      SuggestionPeriodReversedError,
    );
    expect(() => declare({ startsOn: TODAY, endsOn: TODAY })).not.toThrow();
  });

  it("refuse une fin déjà passée à la création", () => {
    expect(() => declare({ startsOn: "2026-10-01", endsOn: "2026-10-17" })).toThrow(
      SuggestionPeriodOverError,
    );
  });

  it("rogne la phrase, efface une traduction vide, et prend une phrase vide pour aucune", () => {
    expect(
      declare({ phrase: { fr: "  Le café  ", en: " ", it: "Il caffè" } }).snapshot().phrase,
    ).toEqual({ fr: "Le café", it: "Il caffè" });
    expect(declare({ phrase: { fr: " " } }).snapshot().phrase).toBeNull();
    expect(declare({ phrase: null }).snapshot().phrase).toBeNull();
  });

  it("refuse une traduction sans français, et une phrase trop longue", () => {
    expect(() => declare({ phrase: { fr: "", en: "Coffee" } })).toThrow(
      InvalidSuggestionPhraseError,
    );
    expect(() => declare({ phrase: { fr: "x".repeat(91) } })).toThrow(InvalidSuggestionPhraseError);
    expect(() => declare({ phrase: { fr: "ok", it: "x".repeat(91) } })).toThrow(
      InvalidSuggestionPhraseError,
    );
  });

  it("refuse une priorité négative, fractionnaire ou trop haute", () => {
    for (const priority of [-1, 1.5, 1000]) {
      expect(() => declare({ priority })).toThrow(InvalidSuggestionPriorityError);
    }
    expect(declare({ priority: 999 }).snapshot().priority).toBe(999);
  });
});

describe("StaffSuggestionRule — gestes", () => {
  it("se réécrit entière, signée par le second auteur, sans changer sa naissance", () => {
    const rule = declare();
    rule.revise(input({ suggestedSkus: ["BOI-002", "BOI-003"], priority: 5 }), LATER);
    expect(rule.snapshot()).toMatchObject({
      suggestedSkus: ["BOI-002", "BOI-003"],
      priority: 5,
      created: STAMP,
      lastWrite: LATER,
    });
  });

  it("se coupe et se rallume, et dit quand rien ne change", () => {
    const rule = declare();
    expect(rule.setActive(true, LATER)).toBe(false);
    expect(rule.setActive(false, LATER)).toBe(true);
    expect(rule.snapshot().active).toBe(false);
    expect(rule.setActive(true, LATER)).toBe(true);
  });

  it("s'archive à l'instant du geste, puis refuse tout geste — un second archivage aussi", () => {
    const rule = declare();
    rule.archive(LATER);
    expect(rule.snapshot().archivedAt).toEqual(LATER.at);
    expect(() => rule.archive(LATER)).toThrow(SuggestionRuleArchivedError);
    expect(() => rule.revise(input(), LATER)).toThrow(SuggestionRuleArchivedError);
    expect(() => rule.setActive(false, LATER)).toThrow(SuggestionRuleArchivedError);
  });

  it("se reconstitue d'une ligne, et la rejuge", () => {
    const record = {
      ...input(),
      id: "rule_1",
      active: false,
      created: STAMP,
      lastWrite: LATER,
      archivedAt: null,
    };
    expect(StaffSuggestionRule.reconstitute(record).snapshot().active).toBe(false);
    expect(() => StaffSuggestionRule.reconstitute({ ...record, suggestedSkus: [] })).toThrow(
      SuggestedCountError,
    );
  });
});

describe("StaffSuggestionRule — les conditions (RS8)", () => {
  const morningNoDrink = {
    ...NO_SUGGESTION_CONDITIONS,
    weekdays: ["mon", "tue", "wed", "thu", "fri"],
    hours: { from: "07:00", to: "11:00" },
    minCartTotalCents: 2_000,
    cartWithoutFamilyId: "fam-boissons",
    pickupAddressIds: ["site-centre"],
  };

  it("les porte, jugées, et une réécriture les remplace", () => {
    const rule = declare({ conditions: morningNoDrink });
    expect(rule.snapshot().conditions).toEqual(morningNoDrink);

    rule.revise(input(), LATER);
    expect(rule.snapshot().conditions).toEqual(NO_SUGGESTION_CONDITIONS);
  });

  it("refuse le seuil hors du panier, et la contradiction avec son déclencheur", () => {
    expect(() =>
      declare({
        trigger: { kind: "everywhere", ref: null },
        placement: "home",
        conditions: { ...NO_SUGGESTION_CONDITIONS, minCartTotalCents: 2_000 },
      }),
    ).toThrow(SuggestionCartConditionPlacementError);
    expect(() =>
      declare({
        trigger: { kind: "category_in_cart", ref: "fam-vien" },
        conditions: { ...NO_SUGGESTION_CONDITIONS, cartWithoutFamilyId: "fam-vien" },
      }),
    ).toThrow(SuggestionFamilyContradictionError);
  });
});
