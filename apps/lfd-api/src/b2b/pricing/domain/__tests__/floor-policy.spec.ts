import { decideFloor, type PriceFloorPolicy } from "../floor-policy.js";

const HARD = { mode: "amount", millicents: 150 } as const;
const DOOR = { mode: "amount", millicents: 120 } as const;

function policy(minQuantity: number | null, minVolumeRatioBp: number | null): PriceFloorPolicy {
  return { hard: HARD, dynamic: { floor: DOOR, unlock: { minQuantity, minVolumeRatioBp } } };
}

describe("sans plancher dynamique", () => {
  it("applique le mur, et n'a rien à évaluer", () => {
    const decision = decideFloor(
      { hard: HARD, dynamic: null },
      {
        quantity: 999,
        observedVolumeRatioBp: 20_000,
      },
    );

    expect(decision).toEqual({ applied: HARD, tier: "hard", unlock: null });
  });
});

describe("la porte s'ouvre quand LES DEUX conditions sont remplies", () => {
  it("ouvre sur quantité + volume atteints", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 120,
      observedVolumeRatioBp: 13_000,
    });

    expect(decision.tier).toBe("dynamic");
    expect(decision.applied).toEqual(DOOR);
  });

  /** « La plus stricte gagne » : une seule condition manquée referme la porte. */
  it("reste au mur si la quantité manque, même avec le volume", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 50,
      observedVolumeRatioBp: 20_000,
    });

    expect(decision.tier).toBe("hard");
    expect(decision.unlock).toMatchObject({ quantityMet: false, volumeMet: true });
  });

  it("reste au mur si le volume manque, même avec la quantité", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 500,
      observedVolumeRatioBp: 10_500,
    });

    expect(decision.tier).toBe("hard");
    expect(decision.unlock).toMatchObject({ quantityMet: true, volumeMet: false });
  });

  it("accepte une condition absente comme remplie", () => {
    const decision = decideFloor(policy(null, 12_500), {
      quantity: 1,
      observedVolumeRatioBp: 13_000,
    });

    expect(decision.tier).toBe("dynamic");
  });

  it("ouvre au seuil exact — la borne est INCLUSE", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 100,
      observedVolumeRatioBp: 12_500,
    });

    expect(decision.tier).toBe("dynamic");
  });
});

describe("faute de mesure, on protège", () => {
  /**
   * Sans volume de référence, la condition de volume est NON remplie et le mur
   * s'applique. Le défaut penche du côté de la maison : un déverrouillage par
   * ignorance serait une remise accordée par un trou dans les données, et
   * personne ne la verrait passer.
   */
  it("ferme la porte quand le volume observé est inconnu", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 500,
      observedVolumeRatioBp: null,
    });

    expect(decision.tier).toBe("hard");
    expect(decision.unlock).toMatchObject({ volumeMet: false });
  });

  it("laisse passer un volume inconnu quand aucune condition de volume n'est posée", () => {
    const decision = decideFloor(policy(100, null), {
      quantity: 500,
      observedVolumeRatioBp: null,
    });

    expect(decision.tier).toBe("dynamic");
  });
});

describe("ce que la décision rend à figer", () => {
  /**
   * C'est ce qui rend le plancher dynamique tenable : sans la mesure consignée,
   * un prix dépendant de l'historique deviendrait inexplicable dès que
   * l'historique bouge.
   */
  it("porte la mesure qui a compté, pas seulement le verdict", () => {
    const decision = decideFloor(policy(100, 12_500), {
      quantity: 120,
      observedVolumeRatioBp: 13_000,
    });

    expect(decision.unlock?.observedVolumeRatioBp).toBe(13_000);
  });
});
