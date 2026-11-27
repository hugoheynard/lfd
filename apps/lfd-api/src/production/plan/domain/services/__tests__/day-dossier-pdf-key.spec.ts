import { DOSSIER_LAYOUT_VERSION, dayDossierPdfKey } from "../day-dossier-pdf.js";

/**
 * La clé du dossier par version du plan (`plan-historique-des-tirages.md`,
 * § 1.10). Dates recopiées dans un nom, jamais comparées à l'horloge (§5).
 */
const DAY = "2026-11-28";
const CLOSED = new Date("2026-11-27T18:00:00.000Z");
const RETAKEN = new Date("2026-11-27T19:10:00.000Z");

describe("dayDossierPdfKey — par version", () => {
  it("une journée versionnée se range sous sa version, dans la mise en page courante", () => {
    expect(dayDossierPdfKey(DAY, CLOSED, null, 3)).toBe(
      `${DAY}/dossier-du-jour-${DOSSIER_LAYOUT_VERSION}-version-3.pdf`,
    );
  });

  it("la version seule fait la clé : l'instant de l'arrêt ou du retirage n'y entre plus", () => {
    expect(dayDossierPdfKey(DAY, CLOSED, RETAKEN, 2)).toBe(dayDossierPdfKey(DAY, RETAKEN, null, 2));
    expect(dayDossierPdfKey(DAY, CLOSED, null, 1)).not.toBe(dayDossierPdfKey(DAY, CLOSED, null, 2));
  });

  it("une journée sans version garde la clé par tirage d'avant, que les papiers rangés gardent", () => {
    expect(dayDossierPdfKey(DAY, CLOSED, null, null)).toBe(
      `${DAY}/dossier-du-jour-v16-arret-2026-11-27T18-00-00-000Z.pdf`,
    );
    expect(dayDossierPdfKey(DAY, CLOSED, RETAKEN, null)).toBe(
      `${DAY}/dossier-du-jour-v16-arret-2026-11-27T18-00-00-000Z-retirage-2026-11-27T19-10-00-000Z.pdf`,
    );
  });
});
