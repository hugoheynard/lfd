import { InvalidEmailError } from "../../../account/domain/errors/account-errors.js";
import {
  FeatureNotExemptibleError,
  UnknownFeatureError,
  UnknownFeatureLevelError,
} from "../feature-access-errors.js";
import { FeatureExemption } from "../feature-exemption.js";
import { FeatureOverride } from "../feature-override.js";

const AUTHOR = { staffUserId: "staff_1", name: "Camille Admin", role: "admin" };
const AT = new Date("2026-09-14T09:00:00.000Z");

describe("FeatureOverride.pose — la valeur est confrontée au catalogue", () => {
  it("accepte un niveau de la clé, sans ses espaces", () => {
    const override = FeatureOverride.pose({
      key: "shop",
      value: " browse ",
      at: AT,
      author: AUTHOR,
    });

    expect(override.key).toBe("shop");
    expect(override.value).toBe("browse");
    expect(override.author).toEqual(AUTHOR);
  });

  it("refuse une valeur qui n'est pas un niveau de la clé", () => {
    expect(() =>
      FeatureOverride.pose({ key: "shop", value: "open", at: AT, author: AUTHOR }),
    ).toThrow(UnknownFeatureLevelError);
  });

  it("nomme les niveaux acceptés dans le refus", () => {
    expect(() =>
      FeatureOverride.pose({ key: "shop", value: "open", at: AT, author: AUTHOR }),
    ).toThrow("closed, browse, order");
  });

  it("refuse une clé hors catalogue", () => {
    expect(() =>
      FeatureOverride.pose({ key: "legacy_flag", value: "order", at: AT, author: AUTHOR }),
    ).toThrow(UnknownFeatureError);
  });
});

describe("FeatureExemption.grant", () => {
  it("refuse une clé hors catalogue", () => {
    expect(() =>
      FeatureExemption.grant({
        id: "ex_1",
        key: "legacy_flag",
        email: "a@b.fr",
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(UnknownFeatureError);
  });

  /** Un mandat signé par un testeur exempté serait un vrai mandat, sur un vrai compte. */
  it("refuse une clé qu'aucune exemption n'ouvre", () => {
    expect(() =>
      FeatureExemption.grant({
        id: "ex_1",
        key: "customerMandate",
        email: "testeur@exemple.fr",
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(FeatureNotExemptibleError);
  });

  it("refuse ce qui n'est manifestement pas une adresse", () => {
    expect(() =>
      FeatureExemption.grant({
        id: "ex_1",
        key: "shop",
        email: "pas-une-adresse",
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(InvalidEmailError);
  });
});
