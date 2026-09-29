import { loadingStateOf, sharedBinsToRedo, unreadyStops } from "../departure-readiness.js";

describe("loadingStateOf — L4-C17", () => {
  it("zéro bac n'est pas « chargé » : non étiqueté", () => {
    expect(loadingStateOf([], new Set())).toBe("unlabelled");
  });

  it("un chargement d'un bac qui n'est plus vivant ne rend pas l'arrêt chargé", () => {
    expect(loadingStateOf([], new Set(["b_annule"]))).toBe("unlabelled");
  });

  it("des bacs restent à charger : partiel", () => {
    expect(loadingStateOf(["b_1", "b_2"], new Set(["b_1"]))).toBe("partial");
  });

  it("tous les bacs vivants chargés : chargé", () => {
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
        { stopId: "s_1", reference: "C-1", state: "loaded", binsToRedo: [] },
        { stopId: "s_2", reference: "C-2", state: "partial", binsToRedo: [] },
      ]),
    ).toEqual({ unlabelled: ["o_3"], partial: ["C-2"] });
  });
});

describe("sharedBinsToRedo — lot 4 bis, v2-4", () => {
  it("nomme les bacs à refaire des SEULS arrêts vivants, avec leur référence", () => {
    expect(
      sharedBinsToRedo(
        [{ id: "s_1" }, { id: "s_2" }],
        [
          { stopId: "s_1", reference: "C-1", state: "loaded", binsToRedo: ["AAAAAA"] },
          { stopId: "s_2", reference: "C-2", state: "loaded", binsToRedo: [] },
          { stopId: "s_gone", reference: "C-9", state: "loaded", binsToRedo: ["ZZZZZZ"] },
        ],
      ),
    ).toEqual([{ code: "AAAAAA", reference: "C-1" }]);
  });
});
