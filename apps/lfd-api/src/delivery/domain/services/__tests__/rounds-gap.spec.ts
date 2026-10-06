import {
  daysToWatch,
  dueOf,
  isRoundsGap,
  roundsGapWords,
  ROUNDS_GAP_BELL_TIME,
  type LocalNow,
} from "../rounds-gap.js";

const NOW: LocalNow = { today: "2026-10-06", tomorrow: "2026-10-07", time: "15:59" };
const CLOSED = new Date(0);

describe("l'alerte avant le jour J — le jour imminent", () => {
  it("aujourd'hui, demain, puis rien", () => {
    expect(dueOf("2026-10-06", NOW)).toBe("today");
    expect(dueOf("2026-10-07", NOW)).toBe("tomorrow");
    expect(dueOf("2026-10-08", NOW)).toBeNull();
    expect(dueOf("2026-10-05", NOW)).toBeNull();
  });

  it("avant 16 h, la cloche ne regarde qu'aujourd'hui", () => {
    expect(daysToWatch(NOW)).toEqual(["2026-10-06"]);
  });

  it("dès 16 h, elle regarde aussi demain", () => {
    expect(daysToWatch({ ...NOW, time: ROUNDS_GAP_BELL_TIME })).toEqual([
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(daysToWatch({ ...NOW, time: "23:55" })).toHaveLength(2);
  });
});

describe("l'alerte avant le jour J — faut-il prévenir ?", () => {
  it("plan arrêté et des livraisons hors tournée : oui", () => {
    expect(isRoundsGap({ closedAt: CLOSED, unplacedCount: 3 })).toBe(true);
  });

  it("tout est en tournée : non", () => {
    expect(isRoundsGap({ closedAt: CLOSED, unplacedCount: 0 })).toBe(false);
  });

  it("plan pas arrêté (un retirage reçu seul) : non, la liste n'est pas figée", () => {
    expect(isRoundsGap({ closedAt: null, unplacedCount: 3 })).toBe(false);
  });
});

describe("l'alerte avant le jour J — les mots", () => {
  it("demain, au pluriel", () => {
    expect(
      roundsGapWords({ serviceDay: "2026-10-07", due: "tomorrow", unplacedCount: 3 }).subject,
    ).toBe("Demain, mercredi 7 octobre : 3 livraisons hors tournée");
  });

  it("aujourd'hui, au singulier, et le geste de sortie", () => {
    const words = roundsGapWords({ serviceDay: "2026-10-06", due: "today", unplacedCount: 1 });

    expect(words.subject).toBe("Aujourd'hui, mardi 6 octobre : 1 livraison hors tournée");
    expect(words.body).toContain("« Proposer les tournées »");
  });
});
