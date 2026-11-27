import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import {
  CLOSED,
  DAY,
  JEANNE,
  PAUL,
  RETAKEN,
  closedDay,
  closure,
  retake,
  retakenDay,
  setup,
} from "./send-dossier-scene.js";

/**
 * **Chaque envoi du dossier note sa version** (`plan-historique-des-tirages.md`,
 * § 7 Q2, H2b) : le numéro de la journée que l'abonné a chargée, celui du
 * papier joint — rangé sous la même version.
 */
describe("la trace d'envoi porte la version du papier joint", () => {
  it("à l'arrêt : chaque destinataire porte la version 1, et le dossier est rangé sous elle", async () => {
    const day = closedDay();
    day.numberPlanVersion(1);
    const store = new InMemoryProductionStore();
    const { closed, log } = setup([PAUL, JEANNE], day, { store });

    await closed.handle(closure());

    expect([...log.rows.values()].map((row) => row.planVersion)).toEqual([1, 1]);
    expect(store.objects.has(dayDossierPdfKey(DAY, CLOSED, null, 1))).toBe(true);
  });

  it("au retirage : la version que la journée porte alors, pas celle de l'arrêt", async () => {
    const day = retakenDay();
    day.numberPlanVersion(1);
    day.numberPlanVersion(2);
    const store = new InMemoryProductionStore();
    const { retaken, log } = setup([PAUL], day, { store });

    await retaken.handle(retake());

    expect(log.rows.get(`${DAY}|${RETAKEN.toISOString()}|r-paul`)?.planVersion).toBe(2);
    expect(store.objects.has(dayDossierPdfKey(DAY, CLOSED, RETAKEN, 2))).toBe(true);
  });

  it("une journée sans version : la trace n'en invente pas", async () => {
    const { closed, log } = setup([PAUL]);

    await closed.handle(closure());

    expect([...log.rows.values()].map((row) => row.planVersion)).toEqual([null]);
  });
});
