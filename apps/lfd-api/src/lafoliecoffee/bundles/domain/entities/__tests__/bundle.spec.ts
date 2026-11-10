import {
  BundleAlreadyDraftError,
  BundleAlreadyWithdrawnError,
  BundleTooFewGroupsError,
  BundleWithdrawnError,
  InvalidBundleAudienceError,
  InvalidBundleStatusError,
  InvalidBundleTextError,
} from "../../errors/bundle-errors.js";
import {
  BUNDLE_DESCRIPTION_MAX_LENGTH,
  BUNDLE_NAME_MAX_LENGTH,
} from "../../value-objects/bundle-text.js";
import { Bundle } from "../bundle.js";
import { breakfast, createdBreakfast, CREATED_AT, LATER, recordOf } from "./bundle-fixtures.js";

const LATER_WRITE = { by: "staff_2", at: LATER };

describe("Bundle.create", () => {
  it("naît en brouillon, pour le public, sa clé tirée du nom", () => {
    expect(createdBreakfast().snapshot()).toEqual({
      id: "bundle_1",
      key: "petit-dejeuner",
      name: "Petit déjeuner",
      description: "Une douceur, une baguette, une boisson.",
      audience: "public",
      status: "draft",
      groups: [
        { key: "douceur", label: "Douceur", choices: ["VIE-001-1", "VIE-002-1"] },
        { key: "baguette", label: "Baguette", choices: ["PAI-001-1"] },
        { key: "boisson", label: "Boisson", choices: ["BOI-001-1", "BOI-002-1"] },
      ],
      createdAt: CREATED_AT,
      writtenAt: CREATED_AT,
      writtenBy: "staff_1",
    });
  });

  it("lit une description vide comme aucune", () => {
    expect(createdBreakfast({ description: "  " }).snapshot().description).toBeNull();
  });

  it.each(["", "  ", "!!!", "☕", "x".repeat(BUNDLE_NAME_MAX_LENGTH + 1)])(
    "refuse le nom « %s »",
    (name) => {
      expect(() => createdBreakfast({ name })).toThrow(InvalidBundleTextError);
    },
  );

  it("refuse une description trop longue", () => {
    expect(() =>
      createdBreakfast({ description: "x".repeat(BUNDLE_DESCRIPTION_MAX_LENGTH + 1) }),
    ).toThrow(InvalidBundleTextError);
  });

  /** D4, Q5 : le public seulement, pour l'instant. */
  it.each(["pro", "both"])("refuse la clientèle « %s »", (audience) => {
    expect(() => createdBreakfast({ audience })).toThrow(InvalidBundleAudienceError);
  });

  it("refuse une formule d'un seul groupe", () => {
    const one = breakfast().groups.slice(0, 1);

    expect(() => createdBreakfast({ groups: one })).toThrow(BundleTooFewGroupsError);
  });
});

describe("Bundle — présentation", () => {
  it("renomme sans changer de clé, et signe l'écriture", () => {
    const bundle = createdBreakfast();

    bundle.rename("Petit déjeuner gourmand", LATER_WRITE);
    bundle.describe(null, LATER_WRITE);

    expect(bundle.snapshot()).toMatchObject({
      key: "petit-dejeuner",
      name: "Petit déjeuner gourmand",
      description: null,
      writtenAt: LATER,
      writtenBy: "staff_2",
      createdAt: CREATED_AT,
    });
  });

  it("refuse un nom vide au renommage", () => {
    expect(() => createdBreakfast().rename(" ", LATER_WRITE)).toThrow(InvalidBundleTextError);
  });
});

describe("Bundle.recompose", () => {
  it("ajoute, retire, renomme et réordonne en un geste, les clés existantes gardées", () => {
    const bundle = createdBreakfast();

    bundle.recompose(
      [
        { key: "boisson", label: "Boissons chaudes", choices: ["BOI-002-1"] },
        { key: "douceur", label: "Douceur", choices: ["VIE-002-1", "VIE-001-1"] },
        { key: null, label: "Fruit", choices: ["FRU-001-1"] },
      ],
      LATER_WRITE,
    );

    expect(bundle.snapshot().groups).toEqual([
      { key: "boisson", label: "Boissons chaudes", choices: ["BOI-002-1"] },
      { key: "douceur", label: "Douceur", choices: ["VIE-002-1", "VIE-001-1"] },
      { key: "fruit", label: "Fruit", choices: ["FRU-001-1"] },
    ]);
  });

  it("ne garde rien d'une composition refusée", () => {
    const bundle = createdBreakfast();
    const before = bundle.snapshot();

    expect(() =>
      bundle.recompose(
        [{ key: "baguette", label: "Baguette", choices: ["PAI-001-1"] }],
        LATER_WRITE,
      ),
    ).toThrow(BundleTooFewGroupsError);
    expect(bundle.snapshot()).toBe(before);
  });

  it("nomme les seuls articles qu'une composition ajouterait", () => {
    const added = createdBreakfast().choicesAddedBy([
      { key: "douceur", label: "Douceur", choices: ["VIE-001-1", " NEW-1 "] },
      { key: null, label: "Autre", choices: ["NEW-1", "NEW-2"] },
    ]);

    expect(added).toEqual(["NEW-1", "NEW-2"]);
  });
});

describe("Bundle — retrait et brouillon", () => {
  it("se retire, puis revient en brouillon", () => {
    const bundle = createdBreakfast();

    bundle.withdraw(LATER_WRITE);
    expect(bundle.snapshot()).toMatchObject({ status: "withdrawn", writtenBy: "staff_2" });
    bundle.returnToDraft(LATER_WRITE);
    expect(bundle.snapshot().status).toBe("draft");
  });

  it("refuse de retirer deux fois, et de remettre en brouillon un brouillon", () => {
    const bundle = createdBreakfast();

    expect(() => bundle.returnToDraft(LATER_WRITE)).toThrow(BundleAlreadyDraftError);
    bundle.withdraw(LATER_WRITE);
    expect(() => bundle.withdraw(LATER_WRITE)).toThrow(BundleAlreadyWithdrawnError);
  });

  /** Une formule retirée se reprend en la remettant en brouillon, jamais en douce. */
  it("refuse toute modification d'une formule retirée", () => {
    const bundle = createdBreakfast();
    bundle.withdraw(LATER_WRITE);
    const groups = bundle.snapshot().groups;

    expect(() => bundle.rename("Autre", LATER_WRITE)).toThrow(BundleWithdrawnError);
    expect(() => bundle.describe(null, LATER_WRITE)).toThrow(BundleWithdrawnError);
    expect(() => bundle.recompose(groups, LATER_WRITE)).toThrow(BundleWithdrawnError);
  });
});

describe("Bundle.reconstitute", () => {
  it("relit ce qu'elle a écrit", () => {
    const bundle = createdBreakfast();

    expect(Bundle.reconstitute(recordOf(bundle)).snapshot()).toEqual(bundle.snapshot());
  });

  it("refuse une ligne au statut ou à la clientèle inconnus", () => {
    const record = recordOf(createdBreakfast());

    expect(() => Bundle.reconstitute({ ...record, status: "on_sale" })).toThrow(
      InvalidBundleStatusError,
    );
    expect(() => Bundle.reconstitute({ ...record, audience: "pro" })).toThrow(
      InvalidBundleAudienceError,
    );
  });
});
