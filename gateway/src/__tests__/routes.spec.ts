import { describe, expect, it } from "vitest";

import { GATEWAY_SUBDOMAINS } from "@lfd/endpoints";

import {
  API_PREFIXES,
  FRONT_PREFIXES,
  frontHeaders,
  resolveTarget,
  ZONE_HOSTNAME,
} from "../routes";

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

/**
 * Régression : `https://lafoliecoffee.info//example.com/` servait la page
 * d'example.com sous la zone, et `/pro//example.com` y redirigeait.
 */
describe("resolveTarget — un chemin à double barre ne répond nulle part", () => {
  it.each([
    "//example.com/",
    "//example.com/x?y=1",
    "/pro//example.com",
    "/api/lfd//example.com/admin",
    "/a//b",
  ])("refuse « %s » sur la zone", (path) => {
    expect(resolveTarget(ZONE_HOSTNAME, path)).toBeUndefined();
  });

  it("refuse aussi hors de la zone", () => {
    expect(resolveTarget("lfd-gateway.lafoliedouce.workers.dev", "//example.com/")).toBeUndefined();
  });
});

describe("resolveTarget — préfixes d'API vers les backends", () => {
  it("route `/api/route-planner` vers `lfd-route-planner`, préfixe retiré, sans le confondre avec `/api/lfd`", () => {
    expect(
      resolveTarget("lafoliecoffee.info", `${API_PREFIXES.routePlanner}/table/v1/driving/x`),
    ).toEqual({
      kind: "backend",
      backend: "routePlanner",
      path: "/table/v1/driving/x",
    });
    expect(resolveTarget("gw.example", `${API_PREFIXES.routePlanner}xyz/table`)).toBeUndefined();
  });

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

  /**
   * Le lien de désinscription des e-mails (plan
   * `la-desinscription-et-l-accord.md`, U2) est bâti par l'API sur
   * l'origine de la boutique : il doit atteindre l'API sur la ZONE, le jeton
   * intact, et ne jamais être servi par le front.
   */
  it("route la désinscription d'un e-mail, sur la zone, vers l'API, jeton intact", () => {
    const token = "v1.a1b2c3d4.aXY.dGFn.Y2lwaGVy";
    expect(resolveTarget(ZONE_HOSTNAME, `${API_PREFIXES.lfd}/mail/unsubscribe/${token}`)).toEqual({
      kind: "backend",
      backend: "lfd",
      path: `/mail/unsubscribe/${token}`,
    });
  });

  /** Le lien de confirmation d'un accord (même plan, C1) : la même route, sous l'API. */
  it("route la confirmation d'une inscription, sur la zone, vers l'API, jeton intact", () => {
    const token = "v1.a1b2c3d4.aXY.dGFn.Y2lwaGVy";
    expect(
      resolveTarget(ZONE_HOSTNAME, `${API_PREFIXES.lfd}/mail/marketing/confirm/${token}`),
    ).toEqual({ kind: "backend", backend: "lfd", path: `/mail/marketing/confirm/${token}` });
  });

  /**
   * La lettre du pied de page (même plan, C5) : un POST public sous l'API, et
   * l'adresse est dans le CORPS — le chemin n'en porte aucune.
   */
  it("route l'inscription à la lettre, sur la zone, vers l'API", () => {
    expect(resolveTarget(ZONE_HOSTNAME, `${API_PREFIXES.lfd}/mail/newsletter`)).toEqual({
      kind: "backend",
      backend: "lfd",
      path: "/mail/newsletter",
    });
  });

  /** « Mes préférences » (même plan, C3) : la route du client connecté, sous l'API. */
  it("route « Mes préférences » des e-mails, sur la zone, vers l'API", () => {
    expect(resolveTarget(ZONE_HOSTNAME, `${API_PREFIXES.lfd}/me/marketing`)).toEqual({
      kind: "backend",
      backend: "lfd",
      path: "/me/marketing",
    });
  });

  it("rend undefined sur un chemin hors périmètre", () => {
    expect(resolveTarget("gw.example", "/favicon.ico")).toBeUndefined();
  });
});

describe("resolveTarget — le front client : la racine de la zone, et /pro qui y renvoie", () => {
  it("sur la zone, l'ancienne adresse /pro RENVOIE vers la même page sans préfixe", () => {
    const target = resolveTarget(ZONE_HOSTNAME, `${FRONT_PREFIXES.pro}/ouverture-compte-pro`);
    expect(target).toEqual({ kind: "redirect", path: "/ouverture-compte-pro" });
  });

  it("sur la zone, /pro EXACT est servi par la boutique, chemin intact (2026-10-19)", () => {
    // Décision du 2026-10-19 : l'accueil pro public vit sur `/pro` ; il
    // renvoyait en 302 vers `/` depuis la bascule du 2026-09-15.
    const served = { kind: "front", front: "pro", path: FRONT_PREFIXES.pro };
    expect(resolveTarget(ZONE_HOSTNAME, FRONT_PREFIXES.pro)).toEqual(served);
    expect(resolveTarget(ZONE_HOSTNAME, `${FRONT_PREFIXES.pro}/`)).toEqual(served);
  });

  it("sur la zone, un chemin sous /pro/ renvoie toujours, requête à part", () => {
    // La requête (`?x=1`) n'est pas dans le pathname : `index.ts` la recolle.
    expect(resolveTarget(ZONE_HOSTNAME, `${FRONT_PREFIXES.pro}/boutique`)).toEqual({
      kind: "redirect",
      path: "/boutique",
    });
  });

  it("hors zone, /pro sert encore le front en retirant le préfixe", () => {
    const target = resolveTarget("gw.example", `${FRONT_PREFIXES.pro}/bienvenue`);
    expect(target).toEqual({ kind: "front", front: "pro", path: "/bienvenue" });
  });

  it("ne vole pas un chemin qui COMMENCE par le préfixe sans lui appartenir", () => {
    // `/production` n'est pas `/pro` : sans cette garde, le préfixe serait
    // retiré d'un chemin qui ne le porte pas. Hors zone, rien ne le sert ; sur
    // la zone, il part au front par la racine, chemin INTACT.
    expect(resolveTarget("gw.example", "/production")).toBeUndefined();
    expect(resolveTarget(ZONE_HOSTNAME, "/production")).toEqual({
      kind: "front",
      front: "pro",
      path: "/production",
    });
  });

  it("la racine de la zone sert le front, chemin intact", () => {
    expect(resolveTarget(ZONE_HOSTNAME, "/bienvenue")).toEqual({
      kind: "front",
      front: "pro",
      path: "/bienvenue",
    });
    expect(resolveTarget(ZONE_HOSTNAME, "/")).toEqual({ kind: "front", front: "pro", path: "/" });
  });

  it("la racine d'un autre hôte ne sert rien — ni workers.dev, ni un inconnu", () => {
    expect(resolveTarget("lfd-gateway.lafoliedouce.workers.dev", "/bienvenue")).toBeUndefined();
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
