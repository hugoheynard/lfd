import { loadingStateOf, unreadyStops } from "../departure-readiness.js";

describe("loadingStateOf — L4-C17", () => {
  it("zéro sac n'est pas « chargé » : non étiqueté", () => {
    expect(loadingStateOf([], new Set())).toBe("unlabelled");
  });

  it("un chargement d'un sac qui n'est plus vivant ne rend pas l'arrêt chargé", () => {
    expect(loadingStateOf([], new Set(["b_annule"]))).toBe("unlabelled");
  });

  it("des sacs restent à charger : partiel", () => {
    expect(loadingStateOf(["b_1", "b_2"], new Set(["b_1"]))).toBe("partial");
  });

  it("tous les sacs vivants chargés : chargé", () => {
    expect(loadingStateOf(["b_1", "b_2"], new Set(["b_1", "b_2"]))).toBe("loaded");
  });
});

describe("unreadyStops", () => {
  const stops = [
    { id: "s_1", orderId: "o_1" },
    { id: "s_2", orderId: "o_2" },
    { id: "s_3", orderId: "o_3" },
  ];

  it("range par cause ; un arrêt non cité est non étiqueté, sous son id de commande", () => {
    expect(
      unreadyStops(stops, [
        { stopId: "s_1", reference: "C-1", state: "loaded" },
        { stopId: "s_2", reference: "C-2", state: "partial" },
      ]),
    ).toEqual({ unlabelled: ["o_3"], partial: ["C-2"] });
  });
});
