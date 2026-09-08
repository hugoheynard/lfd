import { resolveCompany } from "../resolve-company.js";
import type { PrincipalMembership } from "../principal.js";

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
    expect(resolveCompany([], null)).toBeNull();
  });

  it("ignore une société déclarée quand la personne n'appartient à rien", () => {
    expect(resolveCompany([], "co_autre")).toBeNull();
  });
});

describe("un seul rattachement", () => {
  it("agit pour celui-là, sans rien demander", () => {
    // Ce n'est PAS le raccourci que `principal.ts` interdit : il n'y a aucun
    // choix à faire. « La première de plusieurs » et « la seule » ne se
    // ressemblent que dans le code.
    expect(resolveCompany([membership("co_1")], null)).toBe("co_1");
  });

  it("agit pour celui-là même si la déclaration en nomme un autre", () => {
    // La déclaration n'a aucune autorité : elle sert à départager, pas à
    // désigner. Une personne rattachée à une seule maison ne peut pas agir pour
    // une autre en changeant un en-tête.
    expect(resolveCompany([membership("co_1")], "co_2")).toBe("co_1");
  });
});

describe("plusieurs rattachements", () => {
  const both = [membership("co_1"), membership("co_2")];

  it("🔴 n'agit pour PERSONNE tant que rien n'est déclaré", () => {
    // Le cœur du sujet. Retomber sur « la première » servirait le tarif d'une
    // maison à quelqu'un qui en regarde une autre — et personne ne s'en
    // apercevrait, puisque le prix rendu serait parfaitement plausible.
    expect(resolveCompany(both, null)).toBeNull();
  });

  it("agit pour celle qui est déclarée", () => {
    expect(resolveCompany(both, "co_2")).toBe("co_2");
  });

  it("🔴 ignore une déclaration qui ne correspond à aucun rattachement", () => {
    // L'en-tête vient du réseau : il est confronté aux rattachements avant de
    // servir à quoi que ce soit. Sans cette confrontation, il suffirait de le
    // réécrire pour lire la mercuriale d'un concurrent.
    expect(resolveCompany(both, "co_du_concurrent")).toBeNull();
  });

  it("ne se laisse pas prendre par une déclaration vide", () => {
    expect(resolveCompany(both, "")).toBeNull();
  });
});
