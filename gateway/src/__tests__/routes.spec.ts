import { describe, expect, it } from "vitest";

import { GATEWAY_SUBDOMAINS } from "@lfd/endpoints";

import { API_PREFIXES, FRONT_PREFIXES, frontHeaders, resolveTarget } from "../routes";

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

describe("resolveTarget — le front client sous /pro", () => {
  it("route le préfixe, et retire le préfixe", () => {
    const target = resolveTarget("lafoliecoffee.info", `${FRONT_PREFIXES.pro}/bienvenue`);
    expect(target).toEqual({ kind: "front", front: "pro", path: "/bienvenue" });
  });

  it("le préfixe nu mène à la racine du front, pas à la chaîne vide", () => {
    // `/pro` seul doit rendre `/`, sinon l'URL construite côté Pages est invalide.
    expect(resolveTarget("lafoliecoffee.info", FRONT_PREFIXES.pro)).toEqual({
      kind: "front",
      front: "pro",
      path: "/",
    });
  });

  it("ne vole pas un chemin qui COMMENCE par le préfixe sans lui appartenir", () => {
    // `/production` n'est pas `/pro` : sans cette garde, tout chemin préfixé
    // partirait chez le front dès qu'il partagerait ses trois lettres.
    expect(resolveTarget("lafoliecoffee.info", "/production")).toBeUndefined();
  });

  it("l'API garde la priorité sur le front", () => {
    const target = resolveTarget("lafoliecoffee.info", `${API_PREFIXES.lfd}/health`);
    expect(target?.kind).toBe("backend");
  });
});

describe("frontHeaders — ce qui part chez l'hébergeur du front", () => {
  it("ne transmet PAS le Host de la zone", () => {
    // C'est la garde anti-boucle : avec le `Host` de la zone, le sous-appel
    // revient sur cette passerelle et le runtime finit par couper — un 502 qui
    // accuse l'upstream alors qu'il n'a jamais été appelé.
    const kept = frontHeaders(new Headers({ host: "lafoliecoffee.info", accept: "text/html" }));
    expect(kept.get("host")).toBeNull();
    expect(kept.get("accept")).toBe("text/html");
  });

  it("ne transmet ni cookie, ni IP client, ni trace", () => {
    // Un hébergeur de fichiers statiques n'en a aucun usage, et les lui envoyer
    // étend la surface pour rien.
    const kept = frontHeaders(
      new Headers({
        cookie: "session=x",
        "cf-connecting-ip": "203.0.113.1",
        traceparent: "00-a-b-01",
        authorization: "Bearer x",
      }),
    );
    expect([...kept.keys()]).toEqual([]);
  });

  it("garde ce qui sert à négocier et à revalider", () => {
    const kept = frontHeaders(
      new Headers({
        "accept-encoding": "br",
        "accept-language": "it",
        "user-agent": "curl/8",
        "if-none-match": '"abc"',
        range: "bytes=0-1",
      }),
    );
    expect([...kept.keys()].sort()).toEqual([
      "accept-encoding",
      "accept-language",
      "if-none-match",
      "range",
      "user-agent",
    ]);
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
