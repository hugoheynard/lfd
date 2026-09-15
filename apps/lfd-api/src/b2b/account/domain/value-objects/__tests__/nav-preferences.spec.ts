import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { WorkspaceOutOfReachError } from "../../errors/account-errors.js";
import {
  assertWorkspaceWithinReach,
  EMPTY_NAV_PREFERENCES,
  parseNavPreferences,
} from "../nav-preferences.js";

describe("parseNavPreferences", () => {
  it("rend « aucun choix » pour une colonne encore NULL", () => {
    expect(parseNavPreferences(null)).toEqual({ catalogueView: null, workspace: null });
  });

  it("porte l'espace dans les préférences vides", () => {
    expect(EMPTY_NAV_PREFERENCES).toEqual({ catalogueView: null, workspace: null });
  });

  it("relit la vue et l'espace posés ensemble", () => {
    expect(parseNavPreferences({ catalogueView: "list", workspace: "co_1" })).toEqual({
      catalogueView: "list",
      workspace: "co_1",
    });
  });

  it("relit « perso » comme un espace choisi", () => {
    expect(parseNavPreferences({ workspace: PERSONAL_WORKSPACE }).workspace).toBe(
      PERSONAL_WORKSPACE,
    );
  });

  it("garde l'espace quand seule la vue manque", () => {
    // Le sac d'avant le 2026-09-15 ne portait que la vue ; l'inverse arrive
    // pour qui choisit un espace sans avoir jamais touché au catalogue.
    expect(parseNavPreferences({ workspace: "co_1" })).toEqual({
      catalogueView: null,
      workspace: "co_1",
    });
  });

  it.each([[""], [42], [{}], [null]])("retombe sur « aucun choix » pour l'espace %p", (raw) => {
    expect(parseNavPreferences({ workspace: raw }).workspace).toBeNull();
  });

  it("retombe sur « aucun choix » pour une vue inconnue sans perdre l'espace", () => {
    expect(parseNavPreferences({ catalogueView: "mosaic", workspace: "co_1" })).toEqual({
      catalogueView: null,
      workspace: "co_1",
    });
  });
});

describe("assertWorkspaceWithinReach", () => {
  it("accepte « perso », même sans aucune société", () => {
    expect(() => {
      assertWorkspaceWithinReach(PERSONAL_WORKSPACE, []);
    }).not.toThrow();
  });

  it("accepte l'effacement du choix", () => {
    expect(() => {
      assertWorkspaceWithinReach(null, []);
    }).not.toThrow();
  });

  it("accepte une société de la personne", () => {
    expect(() => {
      assertWorkspaceWithinReach("co_2", ["co_1", "co_2"]);
    }).not.toThrow();
  });

  it("🔴 refuse une société à laquelle la personne n'est pas rattachée", () => {
    expect(() => {
      assertWorkspaceWithinReach("co_etrangere", ["co_1"]);
    }).toThrow(WorkspaceOutOfReachError);
  });
});
