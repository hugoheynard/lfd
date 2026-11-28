import {
  ArchivedCompanyExemptionError,
  ExemptedCompanyNotFoundError,
  FeatureExemptedByCompanyError,
  FeatureNotExemptibleByCompanyError,
  FeatureNotExemptibleError,
  UnknownFeatureError,
  UnknownFeatureLevelError,
} from "../feature-access-errors.js";
import { FeatureCompanyExemption } from "../feature-company-exemption.js";
import { FeatureExemption } from "../feature-exemption.js";
import { FeatureOverride } from "../feature-override.js";

const AUTHOR = { staffUserId: "staff_1", name: "Camille Admin", role: "admin" };
const AT = new Date("2026-09-14T09:00:00.000Z");

describe("FeatureOverride.pose — la valeur est confrontée au catalogue", () => {
  it("accepte un niveau de la clé, sans ses espaces", () => {
    const override = FeatureOverride.pose({
      key: "customerMandate",
      value: " open ",
      at: AT,
      author: AUTHOR,
    });

    expect(override.key).toBe("customerMandate");
    expect(override.value).toBe("open");
    expect(override.author).toEqual(AUTHOR);
  });

  it("refuse une valeur qui n'est pas un niveau de la clé", () => {
    expect(() =>
      FeatureOverride.pose({ key: "customerMandate", value: "order", at: AT, author: AUTHOR }),
    ).toThrow(UnknownFeatureLevelError);
  });

  it("nomme les niveaux acceptés dans le refus", () => {
    expect(() =>
      FeatureOverride.pose({ key: "customerMandate", value: "order", at: AT, author: AUTHOR }),
    ).toThrow("closed, open");
  });

  it("refuse une clé hors catalogue", () => {
    expect(() =>
      FeatureOverride.pose({ key: "legacy_flag", value: "order", at: AT, author: AUTHOR }),
    ).toThrow(UnknownFeatureError);
  });

  /** Retirée le 2026-10-09 : on ne repose pas une dérogation sur une clé disparue. */
  it("refuse une clé retirée du catalogue", () => {
    expect(() =>
      FeatureOverride.pose({ key: "shop", value: "closed", at: AT, author: AUTHOR }),
    ).toThrow(UnknownFeatureError);
  });
});

describe("FeatureOverride.changes", () => {
  const override = FeatureOverride.pose({
    key: "customerMandate",
    value: "open",
    at: AT,
    author: AUTHOR,
  });

  it("déjà à cette valeur → inchangé", () => {
    expect(override.changes("open")).toBe(false);
  });

  it("une autre valeur, ou aucune dérogation → changement", () => {
    expect(override.changes("closed")).toBe(true);
    expect(override.changes(null)).toBe(true);
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
});

describe("FeatureExemption.grant — une clé qui s'exempte par société", () => {
  it("refuse une adresse pour le planificateur, et dit de choisir la société", () => {
    expect(() =>
      FeatureExemption.grant({
        id: "ex_1",
        key: "orderPlanner",
        email: "chef@chalet.test",
        at: AT,
        author: AUTHOR,
      }),
    ).toThrow(FeatureExemptedByCompanyError);
  });
});

describe("FeatureCompanyExemption.grant", () => {
  const CHALET = { id: "co_chalet", name: "Chalet Alpin", archived: false };
  const grant = (key: string, company: typeof CHALET | null) =>
    FeatureCompanyExemption.grant({ key, companyId: "co_chalet", company, at: AT, author: AUTHOR });

  it("exempte la société, nom figé et auteur figé", () => {
    const exemption = grant("orderPlanner", CHALET);

    expect(exemption).toMatchObject({
      key: "orderPlanner",
      companyId: "co_chalet",
      companyName: "Chalet Alpin",
      at: AT,
      author: AUTHOR,
    });
  });

  it("refuse une clé hors catalogue", () => {
    expect(() => grant("legacy_flag", CHALET)).toThrow(UnknownFeatureError);
  });

  it("refuse une clé qui ne s'exempte pas société par société", () => {
    expect(() => grant("customerMandate", CHALET)).toThrow(FeatureNotExemptibleByCompanyError);
    expect(() => grant("facebookLogin", CHALET)).toThrow(FeatureNotExemptibleByCompanyError);
  });

  it("refuse une société inconnue", () => {
    expect(() => grant("orderPlanner", null)).toThrow(ExemptedCompanyNotFoundError);
  });

  it("refuse une société dont le compte a été supprimé, en la nommant", () => {
    expect(() => grant("orderPlanner", { ...CHALET, archived: true })).toThrow(/Chalet Alpin/);
    expect(() => grant("orderPlanner", { ...CHALET, archived: true })).toThrow(
      ArchivedCompanyExemptionError,
    );
  });
});
