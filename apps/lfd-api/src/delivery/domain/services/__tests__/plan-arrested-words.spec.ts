import { deliveryDayLabel, planArrestedWords } from "../plan-arrested-words.js";

describe("deliveryDayLabel", () => {
  it("dit la journée comme l'équipe la dit", () => {
    expect(deliveryDayLabel("2026-10-07")).toBe("mercredi 7 octobre");
    expect(deliveryDayLabel("2026-02-01")).toBe("dimanche 1er février");
  });
});

describe("planArrestedWords — la cloche du plan arrêté", () => {
  it("le premier arrêt annonce toutes les livraisons à mettre en tournées", () => {
    const words = planArrestedWords({ serviceDay: "2026-10-07", added: 12, total: 12, gap: null });

    expect(words.subject).toBe(
      "Le plan du mercredi 7 octobre est arrêté : 12 livraisons à mettre en tournées",
    );
    expect(words.body).toContain("Proposer les tournées");
  });

  it("une seule livraison s'accorde au singulier", () => {
    expect(
      planArrestedWords({ serviceDay: "2026-10-07", added: 1, total: 1, gap: null }).subject,
    ).toBe("Le plan du mercredi 7 octobre est arrêté : 1 livraison à mettre en tournées");
  });

  it("une croissance ensuite dit les nouvelles à placer", () => {
    expect(
      planArrestedWords({ serviceDay: "2026-10-07", added: 2, total: 14, gap: null }).subject,
    ).toBe("Le plan du mercredi 7 octobre est complété : 2 nouvelles livraisons à placer");
    expect(
      planArrestedWords({ serviceDay: "2026-10-07", added: 1, total: 14, gap: null }).subject,
    ).toBe("Le plan du mercredi 7 octobre est complété : 1 nouvelle livraison à placer");
  });

  it("sans véhicule mesuré, la cloche dit qu'on ne peut pas proposer, et où régler", () => {
    const words = planArrestedWords({
      serviceDay: "2026-10-07",
      added: 3,
      total: 3,
      gap: "no_measured_vehicle",
    });

    expect(words.body).toContain("Impossible de proposer les tournées");
    expect(words.body).toContain("Livraison → Véhicules");
  });

  it("sans type de bac en service, pareil, vers les bacs", () => {
    const words = planArrestedWords({
      serviceDay: "2026-10-07",
      added: 3,
      total: 3,
      gap: "no_active_bin_type",
    });

    expect(words.body).toContain("Livraison → Bacs");
  });
});
