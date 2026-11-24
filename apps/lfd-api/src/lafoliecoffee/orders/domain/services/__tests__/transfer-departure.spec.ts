import {
  firstOpenPublicSlot,
  requiredArrival,
  type TransferDepartureInput,
  transferArrival,
  transferDeparture,
} from "../transfer-departure.js";

const BASE: TransferDepartureInput = {
  proPickup: null,
  publicRules: [],
  publicClosures: [],
  orderWindows: [],
  counterSetupMinutes: 0,
  resupplyArrival: null,
  travelMinutes: 25,
};

describe("transferDeparture — l'heure de départ requise d'un transfert", () => {
  it("part du plus tôt entre l'ouverture pros et le premier créneau public", () => {
    const result = transferDeparture({
      ...BASE,
      proPickup: { start: "06:30", end: "08:00" },
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
      counterSetupMinutes: 15,
    });

    expect(result).toEqual({ arrivalBy: "06:15", departureBy: "05:50" });
  });

  it("prend le créneau public quand il précède l'ouverture pros", () => {
    const result = transferDeparture({
      ...BASE,
      proPickup: { start: "08:00", end: "09:00" },
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
    });

    expect(result?.arrivalBy).toBe("07:00");
  });

  it("ignore un créneau public fermé ce jour-là", () => {
    const result = transferDeparture({
      ...BASE,
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
      publicClosures: [{ start: "07:00", end: "07:45" }],
    });

    // 07:30–08:00 est entamé par la fermeture : le premier créneau entier est 08:00.
    expect(result?.arrivalBy).toBe("08:00");
  });

  it("une mise en place nulle ne décale rien", () => {
    const result = transferDeparture({ ...BASE, proPickup: { start: "07:00", end: "09:00" } });

    expect(result).toEqual({ arrivalBy: "07:00", departureBy: "06:35" });
  });

  it("sans créneau du site, se rabat sur la plus matinale des fenêtres des commandes", () => {
    const result = transferDeparture({
      ...BASE,
      orderWindows: [
        { start: "10:00", end: "11:00" },
        { start: null, end: "09:00" },
      ],
    });

    expect(result?.arrivalBy).toBe("09:00");
  });

  it("sans créneau ni commande datée, ne se calcule pas", () => {
    expect(transferDeparture(BASE)).toBeNull();
  });

  /**
   * Régression : un trajet inconnu effaçait aussi l'arrivée, et le transfert
   * se plaçait sans fenêtre.
   */
  it("sans trajet connu (site sans GPS, calcul routier absent), garde l'arrivée sans départ", () => {
    expect(
      transferDeparture({
        ...BASE,
        proPickup: { start: "07:00", end: "09:00" },
        travelMinutes: null,
      }),
    ).toEqual({ arrivalBy: "07:00", departureBy: null });
  });

  it("ne part jamais la veille", () => {
    const result = transferDeparture({
      ...BASE,
      proPickup: { start: "00:10", end: "02:00" },
      counterSetupMinutes: 5,
    });

    expect(result?.departureBy).toBe("00:00");
  });
});

describe("firstOpenPublicSlot", () => {
  it("une fermeture de toute la journée ferme tout", () => {
    expect(
      firstOpenPublicSlot(
        [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
        [{ start: null, end: null }],
      ),
    ).toBeNull();
  });

  it("un pas nul fait de la règle un seul créneau", () => {
    expect(firstOpenPublicSlot([{ start: "07:00", end: "08:00", slotMinutes: 0 }], [])).toBe(420);
  });
});

describe("requiredArrival — l'heure à laquelle ce qui sert le point doit y être", () => {
  it("vaut la référence moins la mise en place, la même que l'arrivée du transfert", () => {
    const input = {
      ...BASE,
      proPickup: { start: "06:30", end: "08:00" },
      counterSetupMinutes: 15,
    };

    expect(requiredArrival(input)).toBe("06:15");
    expect(requiredArrival(input)).toBe(transferDeparture(input)?.arrivalBy);
  });

  it("ne dépend pas du trajet : un trajet inconnu ne l'efface pas", () => {
    const input = {
      ...BASE,
      travelMinutes: null,
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
    };

    expect(transferDeparture(input)?.departureBy).toBeNull();
    expect(requiredArrival(input)).toBe("07:00");
  });

  it("sans aucune heure de référence, il n'y en a pas", () => {
    expect(requiredArrival(BASE)).toBeNull();
  });

  it("ne remonte pas avant minuit", () => {
    expect(
      requiredArrival({
        ...BASE,
        proPickup: { start: "00:10", end: "01:00" },
        counterSetupMinutes: 30,
      }),
    ).toBe("00:00");
  });
});

describe("transferArrival — la plus faible échéance de ce que le transfert porte", () => {
  const OPENING = { ...BASE, proPickup: { start: "07:30", end: "09:00" }, counterSetupMinutes: 10 };

  it("un réassort à 05:30 avance l'arrivée, et le départ avec elle", () => {
    expect(transferDeparture({ ...OPENING, resupplyArrival: "05:30" })).toEqual({
      arrivalBy: "05:30",
      departureBy: "05:05",
    });
  });

  it("un réassort à 13:00 ne la retarde pas : l'ouverture reste un plancher", () => {
    expect(transferArrival({ ...OPENING, resupplyArrival: "13:00" })).toBe("07:20");
  });

  it("l'heure du réassort est déjà une arrivée : la mise en place n'en est pas retirée", () => {
    expect(transferArrival({ ...BASE, counterSetupMinutes: 30, resupplyArrival: "06:30" })).toBe(
      "06:30",
    );
  });

  it("sans ouverture ni créneau, la plus tôt des fenêtres des commandes et des réassorts", () => {
    const orders = { ...BASE, orderWindows: [{ start: "09:00", end: "10:00" }] };

    expect(transferArrival({ ...orders, resupplyArrival: "08:00" })).toBe("08:00");
    expect(transferArrival({ ...orders, resupplyArrival: "11:00" })).toBe("09:00");
  });

  it("l'heure proposée au réassort suivant ne compte pas les réassorts (non circulaire)", () => {
    expect(requiredArrival(OPENING)).toBe("07:20");
    expect(transferArrival({ ...OPENING, resupplyArrival: "05:30" })).toBe("05:30");
  });
});
