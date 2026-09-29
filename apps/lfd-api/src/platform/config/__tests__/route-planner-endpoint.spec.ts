import {
  ROUTE_PLANNER_TOKEN_MIN_LENGTH,
  resolveRoutePlannerEndpoint,
} from "../route-planner-endpoint.js";

/**
 * Lot 8 bis, L8b-C4 : en production, le calcul routier se joint par la
 * passerelle, en `https://`, avec un jeton — sinon il est éteint et la carte
 * de santé le dit. Jamais un Bearer envoyé en clair.
 */
const TOKEN = "k".repeat(64);
const GATEWAY = "https://lafoliecoffee.info/api/route-planner";
const LOCAL = "http://localhost:5055";

describe("resolveRoutePlannerEndpoint — production", () => {
  it("rend l'adresse et le jeton quand les deux sont posés, en https", () => {
    expect(resolveRoutePlannerEndpoint({ url: GATEWAY, token: TOKEN, production: true })).toEqual({
      url: GATEWAY,
      token: TOKEN,
    });
  });

  it("refuse une adresse en http : le jeton partirait en clair", () => {
    expect(resolveRoutePlannerEndpoint({ url: LOCAL, token: TOKEN, production: true })).toBeNull();
  });

  it("refuse l'ancienne adresse interceptée `http://osrm.internal`", () => {
    // Une valeur posée pour la forme B-ter PERSISTE sur le Worker (L8b-C6).
    expect(
      resolveRoutePlannerEndpoint({ url: "http://osrm.internal", token: TOKEN, production: true }),
    ).toBeNull();
  });

  it("refuse l'absence de jeton : la passerelle rendrait 401 à chaque « Proposer »", () => {
    expect(resolveRoutePlannerEndpoint({ url: GATEWAY, token: null, production: true })).toBeNull();
  });

  it("refuse un jeton trop court", () => {
    const short = "k".repeat(ROUTE_PLANNER_TOKEN_MIN_LENGTH - 1);
    expect(
      resolveRoutePlannerEndpoint({ url: GATEWAY, token: short, production: true }),
    ).toBeNull();
  });

  it("refuse une adresse illisible", () => {
    expect(
      resolveRoutePlannerEndpoint({ url: "pas une url", token: TOKEN, production: true }),
    ).toBeNull();
  });
});

describe("resolveRoutePlannerEndpoint — hors production", () => {
  it("accepte un OSRM local nu, sans jeton", () => {
    expect(resolveRoutePlannerEndpoint({ url: LOCAL, token: null, production: false })).toEqual({
      url: LOCAL,
      token: null,
    });
  });

  it("présente un jeton posé, pour éprouver la passerelle depuis un poste", () => {
    expect(resolveRoutePlannerEndpoint({ url: GATEWAY, token: TOKEN, production: false })).toEqual({
      url: GATEWAY,
      token: TOKEN,
    });
  });

  it("sans adresse, rien — en production comme ailleurs", () => {
    expect(resolveRoutePlannerEndpoint({ url: null, token: TOKEN, production: false })).toBeNull();
    expect(resolveRoutePlannerEndpoint({ url: null, token: TOKEN, production: true })).toBeNull();
  });
});
