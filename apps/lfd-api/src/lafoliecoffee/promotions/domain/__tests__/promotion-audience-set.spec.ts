import {
  PromotionAudienceDuplicateCompanyError,
  PromotionAudienceSetEmptyError,
} from "../errors/promotion-audience-errors.js";
import { PromotionMissingTargetIdError } from "../errors/promotion-errors.js";
import type { PromotionAudience } from "../promotion-audience.js";
import { PromotionAudienceSet } from "../promotion-audience-set.js";

/**
 * Le public à plusieurs cibles (plan des promotions, § 15.4, lot L8b) : une
 * forme CANONIQUE, pour que deux écritures du même public donnent la même
 * valeur.
 */

const kinds = (set: PromotionAudienceSet) => set.targets.map((target) => target.kind);

describe("PromotionAudienceSet.of — la normalisation", () => {
  it.each<[string, PromotionAudience[], string[]]>([
    [
      "les deux particuliers ⇒ particuliers",
      [{ kind: "individuals_guest" }, { kind: "individuals_registered" }],
      ["individuals"],
    ],
    ["les deux pros ⇒ pros", [{ kind: "pros_pending" }, { kind: "pros_active" }], ["pros"]],
    [
      "particuliers + pros ⇒ tout le monde",
      [{ kind: "pros" }, { kind: "individuals" }],
      ["everyone"],
    ],
    [
      "les quatre feuilles ⇒ tout le monde",
      [
        { kind: "individuals_guest" },
        { kind: "individuals_registered" },
        { kind: "pros_active" },
        { kind: "pros_pending" },
      ],
      ["everyone"],
    ],
    [
      "tout le monde + une autre ⇒ tout le monde",
      [{ kind: "everyone" }, { kind: "pros" }],
      ["everyone"],
    ],
    [
      "ancêtre + enfant, branche particuliers",
      [{ kind: "individuals" }, { kind: "individuals_guest" }],
      ["individuals"],
    ],
    ["ancêtre + enfant, branche pros", [{ kind: "pros_active" }, { kind: "pros" }], ["pros"]],
    [
      "ancêtre + enfant, tout le monde",
      [{ kind: "individuals_registered" }, { kind: "everyone" }],
      ["everyone"],
    ],
    [
      "inscrits + pros, rangés dans l'ordre du menu",
      [{ kind: "pros" }, { kind: "individuals_registered" }],
      ["individuals_registered", "pros"],
    ],
    [
      "tous sauf les pros actifs ⇒ particuliers + pros en cours d'inscription",
      [{ kind: "everyone_but_active_pros" }],
      ["individuals", "pros_pending"],
    ],
    ["un doublon de public de clientèle s'absorbe", [{ kind: "pros" }, { kind: "pros" }], ["pros"]],
  ])("%s", (_case, targets, expected) => {
    expect(kinds(PromotionAudienceSet.of(targets))).toEqual(expected);
  });

  it("deux écritures du même public donnent la même valeur", () => {
    const left = PromotionAudienceSet.of([
      { kind: "pros_active" },
      { kind: "individuals_guest" },
      { kind: "pros_pending" },
      { kind: "individuals_registered" },
    ]);
    const right = PromotionAudienceSet.of([{ kind: "everyone" }]);
    expect(left.targets).toEqual(right.targets);
  });

  it("garde une société à côté des pros actifs : son rang n'est pas le leur", () => {
    const set = PromotionAudienceSet.of([
      { kind: "company", companyId: "co_1" },
      { kind: "pros_active" },
    ]);
    expect(set.targets).toEqual([{ kind: "pros_active" }, { kind: "company", companyId: "co_1" }]);
  });

  it("garde une société à côté de tout le monde", () => {
    const set = PromotionAudienceSet.of([
      { kind: "everyone" },
      { kind: "company", companyId: "co_1" },
    ]);
    expect(kinds(set)).toEqual(["everyone", "company"]);
  });

  it("une société et la même avec ses sites ⇒ la société et ses sites", () => {
    const set = PromotionAudienceSet.of([
      { kind: "company", companyId: "co_1" },
      { kind: "company_and_sites", companyId: "co_1" },
    ]);
    expect(set.targets).toEqual([{ kind: "company_and_sites", companyId: "co_1" }]);
  });

  it("refuse l'ensemble vide", () => {
    expect(() => PromotionAudienceSet.of([])).toThrow(PromotionAudienceSetEmptyError);
  });

  it("refuse la même société deux fois, en la nommant", () => {
    expect(() =>
      PromotionAudienceSet.of([
        { kind: "company", companyId: "co_1" },
        { kind: "company", companyId: "co_1" },
      ]),
    ).toThrow(new PromotionAudienceDuplicateCompanyError("co_1"));
  });

  it("refuse une société sans identifiant", () => {
    expect(() => PromotionAudienceSet.of([{ kind: "company", companyId: " " }])).toThrow(
      PromotionMissingTargetIdError,
    );
  });
});

describe("PromotionAudienceSet.restore — la relecture", () => {
  it("garde `tous sauf les pros actifs` seul, tel que la reprise l'a écrit", () => {
    expect(kinds(PromotionAudienceSet.restore([{ kind: "everyone_but_active_pros" }]))).toEqual([
      "everyone_but_active_pros",
    ]);
  });

  it("normalise tout le reste comme à l'écriture", () => {
    expect(
      kinds(PromotionAudienceSet.restore([{ kind: "pros_active" }, { kind: "pros_pending" }])),
    ).toEqual(["pros"]);
  });
});

describe("PromotionAudienceSet — couvertures", () => {
  const of = (...targets: PromotionAudience[]) => PromotionAudienceSet.of(targets);

  it.each<[string, PromotionAudienceSet, PromotionAudienceSet, string | null]>([
    [
      "pros contre pros actifs",
      of({ kind: "pros" }),
      of({ kind: "pros_active" }),
      "les pros actifs",
    ],
    [
      "inscrits + pros contre pros",
      of({ kind: "individuals_registered" }, { kind: "pros" }),
      of({ kind: "pros" }),
      "les pros",
    ],
    [
      "tout le monde contre tout le monde",
      of({ kind: "everyone" }),
      of({ kind: "everyone" }),
      "tout le monde",
    ],
    [
      "invités contre inscrits",
      of({ kind: "individuals_guest" }),
      of({ kind: "individuals_registered" }),
      null,
    ],
    ["particuliers contre pros", of({ kind: "individuals" }), of({ kind: "pros" }), null],
    [
      "une société contre la même",
      of({ kind: "company", companyId: "co_1" }),
      of({ kind: "company", companyId: "co_1" }),
      "la société co_1",
    ],
    [
      "une société contre une autre",
      of({ kind: "company", companyId: "co_1" }),
      of({ kind: "company", companyId: "co_2" }),
      null,
    ],
    [
      "une société et ses sites contre une autre société",
      of({ kind: "company_and_sites", companyId: "co_1" }),
      of({ kind: "company", companyId: "co_2" }),
      "la société co_2",
    ],
    [
      "une société contre les pros : hors partition",
      of({ kind: "company", companyId: "co_1" }),
      of({ kind: "pros" }),
      null,
    ],
  ])("%s", (_case, left, right, expected) => {
    expect(left.crossing(right)).toBe(expected);
    expect(right.crossing(left) === null).toBe(expected === null);
  });

  it("dit les audiences qu'il touche — une société est sous les pros", () => {
    const company = of({ kind: "company", companyId: "co_1" });
    expect([company.touches("individuals"), company.touches("pros")]).toEqual([false, true]);
    const registered = of({ kind: "individuals_registered" });
    expect([registered.touches("individuals"), registered.touches("pros")]).toEqual([true, false]);
  });
});
