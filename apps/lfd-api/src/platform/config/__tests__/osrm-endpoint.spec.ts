import { OSRM_TOKEN_MIN_LENGTH, resolveOsrmEndpoint } from "../osrm-endpoint.js";

/**
 * Lot 8 bis, L8b-C4 : en production, le calcul routier se joint par la
 * passerelle, en `https://`, avec un jeton — sinon il est éteint et la carte
 * de santé le dit. Jamais un Bearer envoyé en clair.
 */
const TOKEN = "k".repeat(64);
const GATEWAY = "https://lafoliecoffee.info/api/osrm";
const LOCAL = "http://localhost:5055";

describe("resolveOsrmEndpoint — production", () => {
  it("rend l'adresse et le jeton quand les deux sont posés, en https", () => {
    expect(resolveOsrmEndpoint({ url: GATEWAY, token: TOKEN, production: true })).toEqual({
      url: GATEWAY,
      token: TOKEN,
    });
  });

  it("refuse une adresse en http : le jeton partirait en clair", () => {
    expect(resolveOsrmEndpoint({ url: LOCAL, token: TOKEN, production: true })).toBeNull();
  });

  it("refuse l'ancienne adresse interceptée `http://osrm.internal`", () => {
    // Une valeur posée pour la forme B-ter PERSISTE sur le Worker (L8b-C6).
    expect(
      resolveOsrmEndpoint({ url: "http://osrm.internal", token: TOKEN, production: true }),
    ).toBeNull();
  });

  it("refuse l'absence de jeton : la passerelle rendrait 401 à chaque « Proposer »", () => {
    expect(resolveOsrmEndpoint({ url: GATEWAY, token: null, production: true })).toBeNull();
  });

  it("refuse un jeton trop court", () => {
    const short = "k".repeat(OSRM_TOKEN_MIN_LENGTH - 1);
    expect(resolveOsrmEndpoint({ url: GATEWAY, token: short, production: true })).toBeNull();
  });

  it("refuse une adresse illisible", () => {
    expect(resolveOsrmEndpoint({ url: "pas une url", token: TOKEN, production: true })).toBeNull();
  });
});

describe("resolveOsrmEndpoint — hors production", () => {
  it("accepte un OSRM local nu, sans jeton", () => {
    expect(resolveOsrmEndpoint({ url: LOCAL, token: null, production: false })).toEqual({
      url: LOCAL,
      token: null,
    });
  });

  it("présente un jeton posé, pour éprouver la passerelle depuis un poste", () => {
    expect(resolveOsrmEndpoint({ url: GATEWAY, token: TOKEN, production: false })).toEqual({
      url: GATEWAY,
      token: TOKEN,
    });
  });

  it("sans adresse, rien — en production comme ailleurs", () => {
    expect(resolveOsrmEndpoint({ url: null, token: TOKEN, production: false })).toBeNull();
    expect(resolveOsrmEndpoint({ url: null, token: TOKEN, production: true })).toBeNull();
  });
});
