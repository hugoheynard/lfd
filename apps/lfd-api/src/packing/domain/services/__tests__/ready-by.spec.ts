import { compareReadyBy, readyByOf } from "../ready-by.js";

// Un jour comparé seulement aux départs de la fixture, jamais à l'horloge.
const DAY = "2030-03-12";
const OTHER_DAY = "2030-03-13";

describe("readyByOf — l'heure à laquelle une commande doit être prête (L2)", () => {
  it("une livraison est prête pour le départ de sa tournée, pas pour la fenêtre du client", () => {
    expect(
      readyByOf(
        { fulfillmentMethod: "delivery", dueAt: "11:00" },
        { day: DAY, time: "07:10", via: "delivery" },
        DAY,
      ),
    ).toEqual({ time: "07:10", source: "round" });
  });

  it("une livraison sans tournée n'a pas d'heure — jamais sa fenêtre", () => {
    expect(readyByOf({ fulfillmentMethod: "delivery", dueAt: "11:00" }, undefined, DAY)).toEqual({
      time: null,
      source: null,
    });
  });

  it("un retrait porté par un transfert est prêt pour le départ du transfert", () => {
    expect(
      readyByOf(
        { fulfillmentMethod: "pickup", dueAt: "09:00" },
        { day: DAY, time: "06:30", via: "transfer" },
        DAY,
      ),
    ).toEqual({ time: "06:30", source: "transfer" });
  });

  it("un retrait sur place garde l'échéance figée par le fournil", () => {
    expect(readyByOf({ fulfillmentMethod: "pickup", dueAt: "07:45" }, undefined, DAY)).toEqual({
      time: "07:45",
      source: "due",
    });
    expect(readyByOf({ fulfillmentMethod: "pickup", dueAt: null }, undefined, DAY)).toEqual({
      time: null,
      source: null,
    });
  });

  it("un départ d'un autre jour (commande rapportée, replacée) n'est pas une heure de ce jour", () => {
    expect(
      readyByOf(
        { fulfillmentMethod: "delivery", dueAt: "11:00" },
        { day: OTHER_DAY, time: "05:00", via: "delivery" },
        DAY,
      ),
    ).toEqual({ time: null, source: null });
  });
});

describe("compareReadyBy", () => {
  it("range par heure, sans heure en dernier", () => {
    const sorted = [null, "08:00", "06:30", null, "07:00"].sort(compareReadyBy);
    expect(sorted).toEqual(["06:30", "07:00", "08:00", null, null]);
  });
});
