import {
  firstOpenPublicSlot,
  type TransferDepartureInput,
  transferDeparture,
} from "../transfer-departure.js";

const BASE: TransferDepartureInput = {
  proPickup: null,
  publicRules: [],
  publicClosures: [],
  orderWindows: [],
  counterSetupMinutes: 0,
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

    expect(result).toEqual({ reference: "06:30", arrivalBy: "06:15", departureBy: "05:50" });
  });

  it("prend le créneau public quand il précède l'ouverture pros", () => {
    const result = transferDeparture({
      ...BASE,
      proPickup: { start: "08:00", end: "09:00" },
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
    });

    expect(result?.reference).toBe("07:00");
  });

  it("ignore un créneau public fermé ce jour-là", () => {
    const result = transferDeparture({
      ...BASE,
      publicRules: [{ start: "07:00", end: "12:00", slotMinutes: 30 }],
      publicClosures: [{ start: "07:00", end: "07:45" }],
    });

    // 07:30–08:00 est entamé par la fermeture : le premier créneau entier est 08:00.
    expect(result?.reference).toBe("08:00");
  });

  it("une mise en place nulle ne décale rien", () => {
    const result = transferDeparture({ ...BASE, proPickup: { start: "07:00", end: "09:00" } });

    expect(result).toEqual({ reference: "07:00", arrivalBy: "07:00", departureBy: "06:35" });
  });

  it("sans créneau du site, se rabat sur la plus matinale des fenêtres des commandes", () => {
    const result = transferDeparture({
      ...BASE,
      orderWindows: [
        { start: "10:00", end: "11:00" },
        { start: null, end: "09:00" },
      ],
    });

    expect(result?.reference).toBe("09:00");
  });

  it("sans créneau ni commande datée, ne se calcule pas", () => {
    expect(transferDeparture(BASE)).toBeNull();
  });

  it("sans trajet connu (site sans GPS, calcul routier absent), ne se calcule pas", () => {
    expect(
      transferDeparture({
        ...BASE,
        proPickup: { start: "07:00", end: "09:00" },
        travelMinutes: null,
      }),
    ).toBeNull();
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
