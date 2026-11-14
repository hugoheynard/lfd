import {
  contactModeOfAppointment,
  contactsByMode,
  countOn,
  fallsOn,
  levelReachedOn,
  levelUpsOn,
  NO_MILESTONE,
  parisDayOf,
  type SheetMilestones,
} from "../sales-today.js";

/*
 * Les dates sont ici le SUJET du test et ne se comparent qu'entre elles (le
 * jour se calcule d'un instant fixe, jamais de l'horloge) : elles peuvent
 * rester absolues.
 */

describe("parisDayOf — le jour civil de Paris", () => {
  it("rend la veille du jour UTC à 23 h 30 UTC en hiver (0 h 30 à Paris = le lendemain)", () => {
    const day = parisDayOf(new Date("2030-01-14T23:30:00.000Z"));
    expect(day.day).toBe("2030-01-15");
    expect(day.start.toISOString()).toBe("2030-01-14T23:00:00.000Z");
    expect(day.end.toISOString()).toBe("2030-01-15T23:00:00.000Z");
  });

  it("borne un jour d'été à 22 h UTC", () => {
    const day = parisDayOf(new Date("2030-07-10T12:00:00.000Z"));
    expect(day.start.toISOString()).toBe("2030-07-09T22:00:00.000Z");
    expect(day.end.toISOString()).toBe("2030-07-10T22:00:00.000Z");
  });

  it("fait durer 23 heures le jour du passage à l'heure d'été", () => {
    const day = parisDayOf(new Date("2030-03-31T10:00:00.000Z"));
    expect(day.day).toBe("2030-03-31");
    expect(day.end.getTime() - day.start.getTime()).toBe(23 * 3600 * 1000);
  });

  it("fait durer 25 heures le jour du retour à l'heure d'hiver", () => {
    const day = parisDayOf(new Date("2030-10-27T10:00:00.000Z"));
    expect(day.end.getTime() - day.start.getTime()).toBe(25 * 3600 * 1000);
  });

  it("garde minuit pile dans le jour qui commence, et le rend au suivant à la fin", () => {
    const day = parisDayOf(new Date("2030-01-15T10:00:00.000Z"));
    expect(fallsOn(new Date("2030-01-14T23:00:00.000Z"), day)).toBe(true);
    expect(fallsOn(new Date("2030-01-14T22:59:59.999Z"), day)).toBe(false);
    expect(fallsOn(new Date("2030-01-15T23:00:00.000Z"), day)).toBe(false);
    expect(fallsOn(null, day)).toBe(false);
  });
});

const DAY = parisDayOf(new Date("2030-01-15T10:00:00.000Z"));
const TODAY_AT = new Date("2030-01-15T09:00:00.000Z");
const YESTERDAY_AT = new Date("2030-01-14T09:00:00.000Z");
const milestones = (overrides: Partial<SheetMilestones>): SheetMilestones => ({
  ...NO_MILESTONE,
  ...overrides,
});

describe("levelReachedOn — la montée du jour", () => {
  it("date « Contactée » par le premier contact noté", () => {
    expect(levelReachedOn("contacted", milestones({ firstContactDay: "2030-01-15" }), DAY)).toBe(
      "contacted",
    );
    expect(levelReachedOn("contacted", milestones({ firstContactDay: "2030-01-14" }), DAY)).toBe(
      null,
    );
  });

  it("rend le niveau le plus haut atteint ce jour", () => {
    const all = milestones({
      firstContactDay: "2030-01-15",
      qualifiedStepAt: TODAY_AT,
      holderFirstLoginAt: TODAY_AT,
    });
    expect(levelReachedOn("opened", all, DAY)).toBe("opened");
  });

  it("ne compte pas un niveau que la fiche ne tient plus (adresse archivée)", () => {
    expect(levelReachedOn("contacted", milestones({ qualifiedStepAt: TODAY_AT }), DAY)).toBe(null);
  });

  it("date « Active » par la seconde des deux conditions — activation ou première commande", () => {
    expect(
      levelReachedOn(
        "active",
        milestones({ activatedAt: YESTERDAY_AT, firstOrderAt: TODAY_AT }),
        DAY,
      ),
    ).toBe("active");
    expect(
      levelReachedOn(
        "active",
        milestones({ activatedAt: TODAY_AT, firstOrderAt: YESTERDAY_AT }),
        DAY,
      ),
    ).toBe("active");
    expect(
      levelReachedOn("active", milestones({ activatedAt: TODAY_AT, firstOrderAt: null }), DAY),
    ).toBe(null);
  });

  it("compte une fiche une fois, quel que soit le nombre de niveaux franchis", () => {
    const sheets = [
      {
        level: "opened" as const,
        facts: {
          milestones: milestones({ firstContactDay: "2030-01-15", holderFirstLoginAt: TODAY_AT }),
        },
      },
      {
        level: "qualified" as const,
        facts: { milestones: milestones({ qualifiedStepAt: YESTERDAY_AT }) },
      },
    ];
    expect(levelUpsOn(sheets, DAY)).toBe(1);
  });
});

describe("les contacts et les demandes du jour", () => {
  it("traduit le canal d'un rendez-vous en mode, et ignore un canal inconnu", () => {
    expect(contactModeOfAppointment("onsite")).toBe("visit");
    expect(contactModeOfAppointment("phone")).toBe("phone");
    expect(contactModeOfAppointment("visio")).toBe("visio");
    expect(contactModeOfAppointment("pigeon")).toBe(null);
  });

  it("compte par mode, chaque mode présent même à zéro", () => {
    expect(contactsByMode(["phone", "phone", "visit"])).toEqual({
      phone: 2,
      email: 0,
      visit: 1,
      visio: 0,
      trade_show: 0,
      other: 0,
    });
  });

  it("ne compte que les demandes de ce jour à Paris", () => {
    expect(countOn([TODAY_AT, YESTERDAY_AT, new Date("2030-01-14T23:10:00.000Z")], DAY)).toBe(2);
  });
});
