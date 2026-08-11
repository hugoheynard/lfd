import { classifyPulse } from "../portfolio-pulse.js";

describe("classifyPulse", () => {
  it("range chaque compte sur SA propre variation", () => {
    const pulse = classifyPulse([
      { previousCents: 10_000, currentCents: 20_000 }, // +100 %
      { previousCents: 10_000, currentCents: 10_200 }, // +2 %, dans la bande
      { previousCents: 10_000, currentCents: 4_000 }, // −60 %
    ]);

    expect(pulse).toEqual({ growing: 1, flat: 1, shrinking: 1 });
  });

  it("écarte les comptes qui n'ont rien pesé sur les deux fenêtres", () => {
    // Un dormant n'est pas « stable » : le compter comme tel remplirait la
    // colonne du milieu de tout le fichier, et le chiffre ne dirait plus rien.
    const pulse = classifyPulse([
      { previousCents: 0, currentCents: 0 },
      { previousCents: 0, currentCents: 0 },
    ]);

    expect(pulse).toEqual({ growing: 0, flat: 0, shrinking: 0 });
  });

  it("compte un premier euro comme une croissance", () => {
    const pulse = classifyPulse([{ previousCents: 0, currentCents: 5_000 }]);

    expect(pulse.growing).toBe(1);
  });

  it("compte une chute à zéro comme une baisse", () => {
    const pulse = classifyPulse([{ previousCents: 5_000, currentCents: 0 }]);

    expect(pulse.shrinking).toBe(1);
  });

  it("tient la bande de stabilité par ses deux bords", () => {
    // Exactement ±10 % reste stable ; au-delà, ça bouge.
    const pulse = classifyPulse([
      { previousCents: 1_000, currentCents: 1_100 },
      { previousCents: 1_000, currentCents: 900 },
      { previousCents: 1_000, currentCents: 1_101 },
      { previousCents: 1_000, currentCents: 899 },
    ]);

    expect(pulse).toEqual({ growing: 1, flat: 2, shrinking: 1 });
  });
});
