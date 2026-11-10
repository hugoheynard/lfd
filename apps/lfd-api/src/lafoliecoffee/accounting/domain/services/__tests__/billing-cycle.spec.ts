import { BillingCycleBoundaryError } from "../../errors/accounting-errors.js";
import { CYCLE_CLOSING_TIME, cycleAt, defaultClosureAfter } from "../billing-cycle.js";

/**
 * ⚠️ **Dates absolues, et c'est l'exception prévue.** Le §5 du CLAUDE.md racine
 * l'autorise quand les dates sont le SUJET du test et ne sont comparées qu'entre
 * elles : « le code testé compare-t-il cette date à l'horloge ? » — non, ce
 * module ne lit aucune horloge, l'instant lui est donné. Une fixture relative
 * rendrait au contraire ces tests illisibles : on ne peut pas dire « il y a
 * trois jours » pour désigner un passage à l'heure d'été.
 */

/** 10 septembre 2026, 14h à Paris (CEST, UTC+2). */
const MI_SEPTEMBRE = new Date("2026-09-10T12:00:00.000Z");

describe("cycleAt — sans clôture enregistrée", () => {
  it("va du 1er du mois au 1er du suivant", () => {
    const cycle = cycleAt(MI_SEPTEMBRE, null);
    expect(cycle.startsAt.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(cycle.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  /**
   * 🔴 Le test qui justifie tout le module. Minuit à Paris n'est PAS minuit UTC,
   * et l'écart change deux fois par an : deux heures en été, une en hiver.
   *
   * Une borne posée à minuit UTC ferait basculer les commandes de la soirée du
   * 30 septembre dans le cycle d'octobre — et celles du 31 octobre autrement.
   * L'erreur serait invisible onze mois sur douze.
   */
  it("pose la borne à minuit LOCAL, donc pas au même instant UTC selon la saison", () => {
    // Clôture du 1er octobre : on est encore à l'heure d'ÉTÉ (UTC+2).
    expect(cycleAt(MI_SEPTEMBRE, null).closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");

    // Clôture du 1er novembre : l'heure d'HIVER a repris (UTC+1). Une heure
    // d'écart avec la précédente, pour la même heure locale.
    const miOctobre = new Date("2026-10-15T12:00:00.000Z");
    expect(cycleAt(miOctobre, null).closesAt.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("passe l'année sans se tromper de mois", () => {
    const miDecembre = new Date("2026-12-15T12:00:00.000Z");
    const cycle = cycleAt(miDecembre, null);
    expect(cycle.startsAt.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(cycle.closesAt.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("range une commande passée à l'instant de clôture dans le cycle SUIVANT", () => {
    const cloture = cycleAt(MI_SEPTEMBRE, null).closesAt;
    // La borne haute est exclusive : à cet instant précis, on est dans octobre.
    expect(cycleAt(cloture, null).startsAt.getTime()).toBe(cloture.getTime());
  });
});

describe("cycleAt — après une clôture anticipée", () => {
  /**
   * Le cas pour lequel la borne basse existe. Bornée par le calendrier, la
   * commande passée après une clôture du 20 se retrouverait dans deux cycles
   * ou dans aucun.
   */
  it("repart de la clôture enregistrée, pas du 1er", () => {
    const cloturee20 = new Date("2026-09-20T09:00:00.000Z");
    const cycle = cycleAt(new Date("2026-09-25T12:00:00.000Z"), cloturee20);
    expect(cycle.startsAt.toISOString()).toBe("2026-09-20T09:00:00.000Z");
    expect(cycle.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  /**
   * Un dépôt manqué ne perd rien : le cycle s'étire jusqu'à la clôture ratée.
   * C'est ce que la borne basse achète, et c'est ce qui manquait au modèle
   * calendaire.
   */
  it("couvre DEUX mois quand une clôture a été manquée", () => {
    const clotureDeJuillet = new Date("2026-07-31T22:00:00.000Z");
    const cycle = cycleAt(MI_SEPTEMBRE, clotureDeJuillet);
    expect(cycle.startsAt.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(cycle.closesAt.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  /**
   * Une clôture postérieure à la clôture calculée ne peut pas exister — mais si
   * elle apparaît, elle ne doit pas produire un cycle à l'envers, dont la somme
   * serait vide et l'écran muet.
   */
  it("ignore une clôture qui serait POSTÉRIEURE à la prochaine", () => {
    const impossible = new Date("2027-01-01T00:00:00.000Z");
    expect(cycleAt(MI_SEPTEMBRE, impossible).startsAt.toISOString()).toBe(
      "2026-08-31T22:00:00.000Z",
    );
  });

  it("rend toujours un cycle non vide", () => {
    const cycle = cycleAt(MI_SEPTEMBRE, null);
    expect(cycle.closesAt.getTime()).toBeGreaterThan(cycle.startsAt.getTime());
  });
});

describe("defaultClosureAfter", () => {
  it("rend le 1er du mois suivant, à minuit local", () => {
    expect(defaultClosureAfter(MI_SEPTEMBRE).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("ferme à minuit — l'heure qui clôt la journée, pas celle qui l'ouvre", () => {
    expect(CYCLE_CLOSING_TIME).toBe("00:00");
  });
});

describe("BillingCycleBoundaryError", () => {
  it("nomme le jour et l'heure, pas un code", () => {
    const error = new BillingCycleBoundaryError("2026-03-29", "02:30");
    expect(error.message).toContain("2026-03-29");
    expect(error.message).toContain("02:30");
  });
});
