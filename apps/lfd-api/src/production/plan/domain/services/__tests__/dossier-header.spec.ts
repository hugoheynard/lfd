import { dossierHeader } from "../day-dossier-pdf.js";

/**
 * L'en-tête de chaque page du dossier : le jour du plan, le jour du lot et le
 * tirage (Hugo, 2026-11-18). Dates comparées entre elles seulement (§5).
 */
const SERVICE_DAY = "2026-11-19";
const CLOSED_AT = new Date("2026-11-18T19:00:00.000Z");
const RETAKEN_AT = new Date("2026-11-19T04:30:00.000Z");

describe("dossierHeader", () => {
  it("dit le jour du plan, le jour du lot et le tirage", () => {
    expect(
      dossierHeader({ serviceDay: SERVICE_DAY, closedAt: CLOSED_AT, retakenAt: null, printRun: 1 }),
    ).toBe("Plan du mer. 18 nov. pour le jeu. 19 nov. · v1");
  });

  it("après un retirage, le plan est du jour du retirage", () => {
    expect(
      dossierHeader({
        serviceDay: SERVICE_DAY,
        closedAt: CLOSED_AT,
        retakenAt: RETAKEN_AT,
        printRun: 2,
      }),
    ).toBe("Plan du jeu. 19 nov. pour le jeu. 19 nov. · v2");
  });
});
