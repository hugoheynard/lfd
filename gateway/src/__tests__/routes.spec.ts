import { describe, expect, it } from "vitest";

import { GATEWAY_SUBDOMAINS } from "@lfd/endpoints";

import { API_PREFIXES, resolveTarget } from "../routes";

/**
 * Le résolveur porte **toutes** les décisions de la gateway : `index.ts` ne
 * fait plus qu'exécuter. C'est donc ici que se joue la correction du routage —
 * et ces tests sont ce qui permet de la changer sans deviner.
 *
 * Trois choses valent d'être verrouillées :
 *   - le préfixe est RETIRÉ avant transmission (le backend ignore la gateway) ;
 *   - un préfixe ne vole pas les requêtes d'un préfixe voisin ;
 *   - le dev par sous-domaine continue de fonctionner à l'identique.
 */

describe("resolveTarget — préfixes d'API vers les backends", () => {
  it("route vers le backend et retire le préfixe", () => {
    expect(resolveTarget("gw.example", `${API_PREFIXES.lfd}/platform-settings`)).toEqual({
      kind: "backend",
      backend: "lfd",
      path: "/platform-settings",
    });
  });

  it("rend `/` quand le préfixe est seul, jamais la chaîne vide", () => {
    // La chaîne vide produirait une URL invalide côté backend.
    expect(resolveTarget("gw.example", API_PREFIXES.lfd)).toEqual({
      kind: "backend",
      backend: "lfd",
      path: "/",
    });
  });

  it("conserve les chemins profonds", () => {
    const target = resolveTarget("gw.example", `${API_PREFIXES.lfd}/admin/companies/42`);
    expect(target).toEqual({ kind: "backend", backend: "lfd", path: "/admin/companies/42" });
  });

  it("ne matche PAS un préfixe qui n'est qu'un début de segment", () => {
    // `/api/b2bxyz` n'appartient pas à `/api/b2b`. Sans cette garde, deux
    // préfixes dont l'un préfixe l'autre se voleraient des requêtes. Il n'y a
    // plus qu'un backend, donc plus de collision possible AUJOURD'HUI — ce test
    // garde la garantie en vie pour le jour où un second arrive, et c'est
    // précisément le jour où personne ne la re-déduirait.
    expect(resolveTarget("gw.example", `${API_PREFIXES.lfd}xyz/products`)).toBeUndefined();
  });

  it("rend undefined sur un chemin hors périmètre", () => {
    expect(resolveTarget("gw.example", "/favicon.ico")).toBeUndefined();
  });
});

describe("resolveTarget — sous-domaines de dev, inchangés", () => {
  it("route un sous-domaine `*.localhost` vers son serveur local", () => {
    const target = resolveTarget(`${GATEWAY_SUBDOMAINS.b2bBack}.localhost`, "/platform-settings");
    expect(target?.kind).toBe("url");
  });

  it("le sous-domaine dev l'emporte sur le préfixe", () => {
    // Un poste de dev garde exactement le comportement d'aujourd'hui, même si
    // le chemin ressemble à un préfixe d'API.
    const target = resolveTarget(
      `${GATEWAY_SUBDOMAINS.b2bBack}.localhost`,
      `${API_PREFIXES.lfd}/x`,
    );
    expect(target?.kind).toBe("url");
  });
});
