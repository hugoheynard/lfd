import {
  BillingFollowNeedsActiveParentError,
  NotASubAccountError,
} from "../../errors/hierarchy-errors.js";
import { SubAccountFollows } from "../sub-account-follows.js";
import { chaletCompany, principalCompany } from "./company-hierarchy-fixtures.js";

/** Comparées entre elles seulement : le suivi daté est le sujet. */
const T0 = new Date("2030-03-01T08:00:00.000Z");
const T1 = new Date("2030-03-12T08:00:00.000Z");
const T2 = new Date("2030-04-01T08:00:00.000Z");

describe("SubAccountFollows — le suivi daté d'un principal", () => {
  it("ouvre une période à la date du geste, et répond « à date »", () => {
    const follows = SubAccountFollows.none("chalet");

    expect(follows.follow("pricing", chaletCompany(), principalCompany(), T1)).toBe(true);

    expect(follows.followsAt("pricing", T0)).toBeNull();
    expect(follows.followsAt("pricing", T1)?.parentId).toBe("groupe");
    expect(follows.followsAt("pricing", T2)?.parentId).toBe("groupe");
  });

  it("cesser de suivre ferme la période : l'avant reste lisible, l'après ne suit plus", () => {
    const follows = SubAccountFollows.none("chalet");
    follows.follow("pricing", chaletCompany(), principalCompany(), T0);

    const closed = follows.stopFollowing("pricing", T2);

    expect(closed?.validTo).toEqual(T2);
    expect(follows.followsAt("pricing", T1)?.parentId).toBe("groupe");
    expect(follows.followsAt("pricing", T2)).toBeNull();
    expect(follows.periods).toHaveLength(1);
  });

  it("suivre ce qu'on suit déjà ne rouvre rien", () => {
    const follows = SubAccountFollows.none("chalet");
    follows.follow("contacts", chaletCompany(), principalCompany(), T0);

    expect(follows.follow("contacts", chaletCompany(), principalCompany(), T1)).toBe(false);
    expect(follows.periods).toHaveLength(1);
  });

  it("cesser de suivre ce qu'on ne suit pas ne change rien", () => {
    expect(SubAccountFollows.none("chalet").stopFollowing("billing", T1)).toBeNull();
  });

  it("refuse de suivre un compte qui n'est pas son principal", () => {
    const follows = SubAccountFollows.none("chalet");

    expect(() => follows.follow("pricing", chaletCompany(null), principalCompany(), T0)).toThrow(
      NotASubAccountError,
    );
    expect(() => follows.follow("pricing", chaletCompany("autre"), principalCompany(), T0)).toThrow(
      NotASubAccountError,
    );
  });

  it("refuse de suivre la facturation d'un principal qui n'est pas actif", () => {
    const follows = SubAccountFollows.none("chalet");

    expect(() =>
      follows.follow("billing", chaletCompany(), principalCompany("pending"), T0),
    ).toThrow(BillingFollowNeedsActiveParentError);
    // Le tarif, lui, ne dépend pas du statut du principal.
    expect(follows.follow("pricing", chaletCompany(), principalCompany("pending"), T0)).toBe(true);
  });

  it("détacher ferme toutes les périodes ouvertes, et dit lesquelles", () => {
    const follows = SubAccountFollows.none("chalet");
    follows.follow("billing", chaletCompany(), principalCompany(), T0);
    follows.follow("pricing", chaletCompany(), principalCompany(), T0);

    expect(follows.closeAll(T1)).toEqual(["billing", "pricing"]);
    expect(follows.open).toEqual([]);
  });
});
