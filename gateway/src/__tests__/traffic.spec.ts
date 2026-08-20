import { describe, expect, it } from "vitest";

import { formatTrafficPoint, statusClass, surfaceOf, trafficPoint } from "../traffic";

/**
 * Ce que la gateway retient de son trafic. Deux propriétés valent d'être
 * verrouillées, et elles ne sont pas de même nature :
 *
 *   - **la lisibilité** : un point doit répondre aux questions du §12 du design
 *     (combien, quelle part d'erreurs, où ça rame, qui a fabriqué la réponse) ;
 *   - **la discrétion** : aucun identifiant ne doit pouvoir entrer dans une
 *     dimension. C'est à la fois une question de vie privée et de cardinalité —
 *     et c'est le genre de garde qu'on ne remarque que le jour où il a sauté.
 */

describe("statusClass", () => {
  it("sort le 429 du 4xx, parce que c'est le throttler qui parle", () => {
    // Le rate-limit applicatif est la SEULE défense qui fonctionne (l'edge est
    // inerte). Noyé dans les `4xx`, on ne le verrait jamais mordre.
    expect(statusClass(429)).toBe("429");
    expect(statusClass(403)).toBe("4xx");
  });

  it("range le reste par centaine", () => {
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass(204)).toBe("2xx");
    expect(statusClass(302)).toBe("3xx");
    expect(statusClass(404)).toBe("4xx");
    expect(statusClass(500)).toBe("5xx");
    expect(statusClass(502)).toBe("5xx");
  });
});

describe("surfaceOf", () => {
  it("garde deux segments, pour distinguer les surfaces du back-office", () => {
    // `admin` seul rangerait tout le staff dans une case unique.
    expect(surfaceOf("/admin/companies")).toBe("admin/companies");
    expect(surfaceOf("/admin/orders")).toBe("admin/orders");
  });

  it("s'arrête à deux segments même si le chemin continue", () => {
    expect(surfaceOf("/admin/companies/settings/pieces")).toBe("admin/companies");
  });

  it("remplace tout segment porteur d'un identifiant", () => {
    // Un cuid en dimension, c'est une cardinalité qui explose ET de la donnée
    // client déposée chez Cloudflare. Les deux sont refusées.
    expect(surfaceOf("/companies/cmszuyr12000t8qtyd3h1em7h/contacts")).toBe("companies/_");
    expect(surfaceOf("/orders/42")).toBe("orders/_");
  });

  it("refuse aussi un segment anormalement long, même sans chiffre", () => {
    const long = "a".repeat(40);
    expect(surfaceOf(`/${long}`)).toBe("_");
  });

  it("nomme la racine plutôt que de rendre une chaîne vide", () => {
    expect(surfaceOf("/")).toBe("root");
    expect(surfaceOf("")).toBe("root");
  });

  it("ignore la query — elle porte des valeurs, pas une surface", () => {
    expect(surfaceOf("/admin/appointments?from=2026-08-01&to=2026-08-31")).toBe(
      "admin/appointments",
    );
  });
});

describe("trafficPoint", () => {
  it("indexe sur le nœud, et sur lui seul", () => {
    // Analytics Engine n'accepte qu'un index : c'est la clé d'échantillonnage,
    // donc la dimension qu'on ne veut jamais perdre.
    const point = trafficPoint({
      node: "b2b",
      status: 200,
      forwardedPath: "/admin/orders",
      durationMs: 12.4,
      origin: "upstream",
    });

    expect(point.indexes).toEqual(["b2b"]);
    expect(point.blobs).toEqual(["2xx", "admin/orders", "upstream"]);
  });

  it("distingue un 5xx du backend d'un 502 de la gateway", () => {
    // La distinction porte toute la conclusion : un backend qui répond en
    // échouant n'est pas un backend mort. Seul le second autorise `down`.
    const upstream = trafficPoint({
      node: "b2b",
      status: 500,
      forwardedPath: "/orders",
      durationMs: 30,
      origin: "upstream",
    });
    const gateway = trafficPoint({
      node: "b2b",
      status: 502,
      forwardedPath: "/orders",
      durationMs: 30,
      origin: "gateway",
    });

    expect(upstream.blobs[2]).toBe("upstream");
    expect(gateway.blobs[2]).toBe("gateway");
  });

  it("ne porte que la durée en `doubles` — le comptage vient de l'échantillonnage", () => {
    // Un `1` constant ferait une seconde vérité sur le même comptage, fausse
    // dès que Analytics Engine échantillonne. Le nombre se lit
    // `SUM(_sample_interval)`.
    const point = trafficPoint({
      node: "b2b",
      status: 200,
      forwardedPath: "/catalogue",
      durationMs: 12.6,
      origin: "upstream",
    });

    expect(point.doubles).toEqual([13]);
  });

  it("ne rend jamais une durée négative", () => {
    const point = trafficPoint({
      node: "b2b",
      status: 200,
      forwardedPath: "/catalogue",
      durationMs: -1,
      origin: "upstream",
    });

    expect(point.doubles).toEqual([0]);
  });
});

describe("formatTrafficPoint — la simulation de dev", () => {
  it("rend la ligne journalisée en local, avec les MÊMES champs qu'en production", () => {
    // Le point est construit par `trafficPoint`, pas recopié à la main : c'est
    // ce qui garantit que ce qu'on lit en dev est ce qui partira chez
    // Cloudflare. Une ligne « ressemblante » écrite à part finirait par diverger
    // du vrai format, et on découvrirait l'écart après le déploiement.
    const line = formatTrafficPoint(
      trafficPoint({
        node: "b2b",
        status: 200,
        forwardedPath: "/admin/orders",
        durationMs: 12,
        origin: "upstream",
      }),
    );

    expect(line).toBe("ops b2b 2xx admin/orders upstream 12ms");
  });

  it("montre un throttle et un upstream muet aussi lisiblement", () => {
    const throttled = formatTrafficPoint(
      trafficPoint({
        node: "b2b",
        status: 429,
        forwardedPath: "/orders",
        durationMs: 3,
        origin: "upstream",
      }),
    );
    const unreachable = formatTrafficPoint(
      trafficPoint({
        node: "b2b",
        status: 502,
        forwardedPath: "/catalogue",
        durationMs: 5000,
        origin: "gateway",
      }),
    );

    expect(throttled).toBe("ops b2b 429 orders upstream 3ms");
    expect(unreachable).toBe("ops b2b 5xx catalogue gateway 5000ms");
  });
});
