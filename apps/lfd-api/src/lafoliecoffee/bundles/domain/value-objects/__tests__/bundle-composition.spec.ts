import {
  BundleTooFewGroupsError,
  DuplicateBundleChoiceError,
  DuplicateBundleGroupError,
  EmptyBundleGroupError,
  InvalidBundleTextError,
  UnknownBundleGroupError,
} from "../../errors/bundle-errors.js";
import { composeGroups, type BundleGroupDraft } from "../bundle-composition.js";
import { BUNDLE_GROUP_LABEL_MAX_LENGTH } from "../bundle-text.js";

const NONE = new Set<string>();

function group(
  label: string,
  choices: readonly string[],
  key: string | null = null,
): BundleGroupDraft {
  return { key, label, choices };
}

const BREAKFAST = [group("Douceur", ["VIE-001-1", "VIE-002-1"]), group("Boisson", ["BOI-001-1"])];

describe("composeGroups", () => {
  it("tire la clé d'un groupe neuf de son libellé, et garde l'ordre des groupes et des choix", () => {
    expect(composeGroups(BREAKFAST, NONE)).toEqual([
      { key: "douceur", label: "Douceur", choices: ["VIE-001-1", "VIE-002-1"] },
      { key: "boisson", label: "Boisson", choices: ["BOI-001-1"] },
    ]);
  });

  it("garde la clé d'un groupe existant renommé", () => {
    const groups = composeGroups(
      [group("Douceurs du matin", ["VIE-001-1"], "douceur"), group("Boisson", ["B"])],
      new Set(["douceur"]),
    );

    expect(groups[0]).toMatchObject({ key: "douceur", label: "Douceurs du matin" });
  });

  it.each([0, 1])("refuse %i groupe(s) : une formule en compte au moins deux", (count) => {
    expect(() => composeGroups(BREAKFAST.slice(0, count), NONE)).toThrow(BundleTooFewGroupsError);
  });

  it("refuse un groupe sans choix, blancs compris", () => {
    expect(() =>
      composeGroups([BREAKFAST[0] ?? group("x", []), group("Boisson", [" "])], NONE),
    ).toThrow(EmptyBundleGroupError);
  });

  it("refuse un article présent deux fois, dans un groupe ou dans deux", () => {
    expect(() => composeGroups([group("A", ["X", "X"]), group("B", ["Y"])], NONE)).toThrow(
      DuplicateBundleChoiceError,
    );
    expect(() => composeGroups([group("A", ["X"]), group("B", ["X"])], NONE)).toThrow(
      DuplicateBundleChoiceError,
    );
  });

  it("refuse deux groupes sous la même clé", () => {
    expect(() => composeGroups([group("Boisson", ["X"]), group("boisson !", ["Y"])], NONE)).toThrow(
      DuplicateBundleGroupError,
    );
  });

  it("refuse une clé que la formule ne connaît pas", () => {
    expect(() => composeGroups([group("A", ["X"], "fantome"), group("B", ["Y"])], NONE)).toThrow(
      UnknownBundleGroupError,
    );
  });

  it.each(["", "   ", "—", "x".repeat(BUNDLE_GROUP_LABEL_MAX_LENGTH + 1), "☕"])(
    "refuse le libellé « %s »",
    (label) => {
      expect(() => composeGroups([group(label, ["X"]), group("B", ["Y"])], NONE)).toThrow(
        InvalidBundleTextError,
      );
    },
  );
});
