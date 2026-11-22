import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { resolveCompany } from "../resolve-company.js";
import type { PrincipalMembership } from "../principal.js";
import { UnreachableWorkspaceError } from "../unreachable-workspace.error.js";

/**
 * **Pour quelle société la requête agit.**
 *
 * C'est la fonction qui décide quel tarif un client voit et sous quelle maison
 * sa commande est écrite. Se tromper ici ne produit pas une erreur : ça produit
 * un prix plausible, appliqué à la mauvaise société. D'où l'énumération.
 */

/** Le rôle ne compte pas ici : cette fonction ne décide que du TENANT. */
function membership(companyId: string): PrincipalMembership {
  return { companyId, role: "orders" };
}

describe("aucun rattachement", () => {
  it("n'agit pour personne", () => {
    // Le parcours par défaut de la boutique : on visite, on commande à titre
    // personnel. Ce n'est pas un trou à combler.
    expect(resolveCompany([], [], null)).toBeNull();
  });

  it("🔴 refuse une société déclarée quand la personne n'appartient à rien", () => {
    // Plus de retombée silencieuse sur le perso : la commande partirait hors
    // de la maison que l'écran montre.
    expect(() => resolveCompany([], [], "co_autre")).toThrow(UnreachableWorkspaceError);
  });
});

describe("un seul rattachement", () => {
  it("agit pour celui-là, sans rien demander", () => {
    // Ce n'est PAS le raccourci que `principal.ts` interdit : il n'y a aucun
    // choix à faire. « La première de plusieurs » et « la seule » ne se
    // ressemblent que dans le code.
    expect(resolveCompany([membership("co_1")], [], null)).toBe("co_1");
  });

  it("🔴 refuse une déclaration qui en nomme un autre, sans servir la seule", () => {
    // Une personne rattachée à une seule maison ne peut pas agir pour une
    // autre en changeant un en-tête ; et l'onglet resté sur une société
    // fermée ne commande pas en silence pour celle qui reste.
    expect(() => resolveCompany([membership("co_1")], [], "co_2")).toThrow(
      UnreachableWorkspaceError,
    );
  });
});

describe("plusieurs rattachements", () => {
  const both = [membership("co_1"), membership("co_2")];

  it("🔴 n'agit pour PERSONNE tant que rien n'est déclaré", () => {
    // Le cœur du sujet. Retomber sur « la première » servirait le tarif d'une
    // maison à quelqu'un qui en regarde une autre — et personne ne s'en
    // apercevrait, puisque le prix rendu serait parfaitement plausible.
    expect(resolveCompany(both, [], null)).toBeNull();
  });

  it("agit pour celle qui est déclarée", () => {
    expect(resolveCompany(both, [], "co_2")).toBe("co_2");
  });

  it("🔴 refuse une déclaration qui ne correspond à aucun rattachement", () => {
    // L'en-tête vient du réseau : il est confronté aux rattachements avant de
    // servir à quoi que ce soit. Sans cette confrontation, il suffirait de le
    // réécrire pour lire la mercuriale d'un concurrent.
    expect(() => resolveCompany(both, [], "co_du_concurrent")).toThrow(UnreachableWorkspaceError);
  });

  it("ne se laisse pas prendre par une déclaration vide", () => {
    expect(resolveCompany(both, [], "")).toBeNull();
  });
});

describe("« perso » déclaré", () => {
  // Branche en tête : elle vaut quel que soit le nombre de rattachements. Sans
  // elle, l'espace perso était inexprimable pour qui a exactement une société.

  it("n'agit pour personne quand la personne n'appartient à rien", () => {
    expect(resolveCompany([], [], PERSONAL_WORKSPACE)).toBeNull();
  });

  it("🔴 n'agit pour personne même avec UNE seule société", () => {
    expect(resolveCompany([membership("co_1")], [], PERSONAL_WORKSPACE)).toBeNull();
  });

  it("n'agit pour personne avec plusieurs sociétés", () => {
    expect(
      resolveCompany([membership("co_1"), membership("co_2")], [], PERSONAL_WORKSPACE),
    ).toBeNull();
  });

  it("reste distinct d'une société étrangère déclarée, qui est refusée", () => {
    expect(() => resolveCompany([membership("co_1")], [], "co_etrangere")).toThrow(
      UnreachableWorkspaceError,
    );
  });
});

/**
 * Les sites atteints par héritage (S6, `plan-entrer-dans-ses-sites.md`, R4) :
 * déclarés, ils servent ; jamais d'office. Le prix servi sans en-tête ne
 * change pas pour un principal qui atteint aussi des sites.
 */
describe("resolveCompany — un site atteignable (S6)", () => {
  it("🔴 sans déclaration, le seul rattachement PROPRE reste servi", () => {
    expect(resolveCompany([membership("co_principal")], ["co_site"], null)).toBe("co_principal");
  });

  it("sans rattachement propre, un site atteignable ne sert jamais d'office", () => {
    expect(resolveCompany([], ["co_site"], null)).toBeNull();
  });

  it("déclaré, le site atteignable est servi — un rattachement propre ou plusieurs", () => {
    expect(resolveCompany([membership("co_principal")], ["co_site"], "co_site")).toBe("co_site");
    expect(resolveCompany([], ["co_site"], "co_site")).toBe("co_site");
    expect(resolveCompany([membership("co_1"), membership("co_2")], ["co_site"], "co_site")).toBe(
      "co_site",
    );
  });

  it("un site NON atteignable déclaré est refusé, comme une société étrangère", () => {
    expect(() => resolveCompany([membership("co_principal")], ["co_site"], "co_frere")).toThrow(
      UnreachableWorkspaceError,
    );
    expect(() => resolveCompany([], ["co_site"], "co_frere")).toThrow(UnreachableWorkspaceError);
  });

  it("« perso » déclaré l'emporte, sites atteignables compris", () => {
    expect(resolveCompany([], ["co_site"], PERSONAL_WORKSPACE)).toBeNull();
  });
});
