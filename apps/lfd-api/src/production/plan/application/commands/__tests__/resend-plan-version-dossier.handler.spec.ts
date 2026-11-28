import { ProductionDayNotClosedError, type ProductionDay } from "../../../../day/index.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import {
  DossierPaperNotStoredError,
  DossierRecipientUpToDateError,
  DossierResendRecipientUnknownError,
  NoPlanVersionToResendError,
} from "../../../domain/errors/dossier-resend-errors.js";
import type { StoredDossierRecipient } from "../../../domain/ports/dossier-recipients.reader.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import { ResendPlanVersionDossierCommand } from "../resend-plan-version-dossier.command.js";
import { CLOSED, DAY, NOW, closedDay } from "../../handlers/__tests__/send-dossier-scene.js";
import { resendScene } from "./resend-dossier-scene.js";

const EARLIER = new Date(NOW.getTime() - 60 * 60 * 1000);

const PAUL: StoredDossierRecipient = { id: "r-paul", kind: "staff", staffUserId: "s-paul" };
const JEANNE: StoredDossierRecipient = {
  id: "r-jeanne",
  kind: "external",
  email: "jeanne@imprimerie.fr",
  firstName: "Jeanne",
  lastName: "Roux",
  jobTitle: null,
};
const LEA: StoredDossierRecipient = {
  id: "r-lea",
  kind: "external",
  email: "lea@fournil.fr",
  firstName: "Léa",
  lastName: "Martin",
  jobTitle: null,
};

/** Une journée arrêtée, à la version `version`. */
function dayAt(version: number | null): ProductionDay {
  const day = closedDay();
  for (let n = 1; version !== null && n <= version; n += 1) {
    day.numberPlanVersion(n);
  }
  return day;
}

const toPaul = (key = "k-1", staff = "s-marie") =>
  new ResendPlanVersionDossierCommand(
    DAY,
    { kind: "recipient", recipientId: "r-paul" },
    staff,
    key,
  );
const toOutdated = (key = "k-2") =>
  new ResendPlanVersionDossierCommand(DAY, { kind: "outdated" }, "s-marie", key);

const sent = (recipientId: string, planVersion: number | null, claimedAt = EARLIER) => ({
  recipientId,
  outcome: "sent" as const,
  claimedAt,
  planVersion,
});

describe("ResendPlanVersionDossierHandler — renvoyer le dossier de la version courante", () => {
  it("à un destinataire : une demande par la boîte d'envoi, le papier rangé joint par référence, la trace `requested` à la version courante", async () => {
    const scene = resendScene([PAUL, JEANNE], dayAt(2), NOW, { traces: [sent("r-paul", 1)] });

    await scene.handler.execute(toPaul());

    const key = dayDossierPdfKey(DAY, CLOSED, null, 2);
    expect(scene.store.objects.has(key)).toBe(true);
    expect(scene.mail.queued).toHaveLength(1);
    expect(scene.mail.queued[0]).toMatchObject({
      template: "staff.production-dossier-updated",
      idempotencyKey: `production-dossier-updated:${DAY}:k-1:r-paul`,
      subjects: [{ type: "production_day", id: DAY }],
      data: {
        version: 2,
        sinceVersion: 1,
        received: true,
        pdfStored: { store: "production-documents", key },
        fileName: `dossier-du-jour-${DAY}-version-2.pdf`,
      },
    });
    expect(scene.mail.queued[0]?.idempotencyKey).not.toContain("@");
    expect([...scene.log.rows.entries()]).toEqual([
      [
        `${DAY}|${NOW.toISOString()}|r-paul`,
        { name: "Paul Martin", outcome: { kind: "requested" }, planVersion: 2 },
      ],
    ]);
  });

  it("à tous les dépassés : ceux d'une version ancienne, d'avant les versions, ou sans rien reçu — pas celui qui est à jour", async () => {
    const scene = resendScene([PAUL, JEANNE, LEA], dayAt(3), NOW, {
      traces: [sent("r-paul", 3), sent("r-jeanne", 1), sent("r-lea", null)],
    });

    await scene.handler.execute(toOutdated());

    expect(scene.mail.queued.map((mail) => mail.to)).toEqual([
      "jeanne@imprimerie.fr",
      "lea@fournil.fr",
    ]);
    // Le journal compte les demandes, sans nommer personne.
    expect(scene.events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.dossier_resent",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { subjectLabel: DAY, serviceDay: DAY, version: 3, requested: 2 },
      },
    ]);
  });

  it("chaque destinataire lit ce qui a changé depuis SA version ; sans version reçue, depuis la première", async () => {
    const scene = resendScene([PAUL, JEANNE, LEA], dayAt(4), NOW, {
      traces: [sent("r-paul", 2), sent("r-jeanne", 3), sent("r-jeanne", 1, CLOSED)],
    });

    await scene.handler.execute(toOutdated());

    expect(scene.summaries.asked).toEqual([[DAY, [2, 3, 1], 4]]);
    const bySince = scene.mail.queued.map((mail) => mail.data);
    expect(bySince).toMatchObject([
      { sinceVersion: 2, received: true, production: [{ before: "2", after: "4", delta: "+2" }] },
      { sinceVersion: 3, received: true, production: [{ before: "3", after: "4", delta: "+1" }] },
      { sinceVersion: 1, received: false, production: [{ before: "1", after: "4", delta: "+3" }] },
    ]);
  });

  it("à tous les dépassés quand tout le monde est à jour : aucun e-mail, aucune trace, et pas de refus", async () => {
    const scene = resendScene([PAUL], dayAt(2), NOW, { traces: [sent("r-paul", 2)] });

    await scene.handler.execute(toOutdated());

    expect(scene.mail.queued).toEqual([]);
    expect(scene.log.rows.size).toBe(0);
    expect(scene.summaries.asked).toEqual([]);
    expect(scene.events.traced).toEqual([]);
  });

  it("un destinataire déjà à jour : refusé en le nommant, rien n'est envoyé", async () => {
    const scene = resendScene([PAUL], dayAt(2), NOW, { traces: [sent("r-paul", 2)] });

    await expect(scene.handler.execute(toPaul())).rejects.toThrow(DossierRecipientUpToDateError);
    await expect(scene.handler.execute(toPaul("k-3"))).rejects.toThrow(
      /Paul Martin a déjà reçu la version 2/u,
    );
    expect(scene.mail.queued).toEqual([]);
  });

  it("un destinataire qui n'est plus dans la liste : 404 nommé", async () => {
    const scene = resendScene([JEANNE], dayAt(2), NOW);

    await expect(scene.handler.execute(toPaul())).rejects.toThrow(
      DossierResendRecipientUnknownError,
    );
    expect(scene.mail.queued).toEqual([]);
  });

  it("une journée sans version : refusée, rien n'est envoyé", async () => {
    const scene = resendScene([PAUL], dayAt(null), NOW);

    await expect(scene.handler.execute(toPaul())).rejects.toThrow(NoPlanVersionToResendError);
    expect(scene.mail.queued).toEqual([]);
  });

  it("une journée rouverte : refusée, il n'y a pas de papier courant", async () => {
    const day = dayAt(1);
    day.reopen({ packingStarted: false, dispatchStarted: false }, NOW, "s-marie");
    const scene = resendScene([PAUL], day, NOW);

    await expect(scene.handler.execute(toPaul())).rejects.toThrow(ProductionDayNotClosedError);
  });

  it("un papier qui ne peut pas être rangé : le geste est refusé, aucune demande ni trace", async () => {
    const store = new InMemoryProductionStore();
    store.failOn = "save";
    const scene = resendScene([PAUL], dayAt(2), NOW, { store, traces: [sent("r-paul", 1)] });

    await expect(scene.handler.execute(toPaul())).rejects.toThrow(DossierPaperNotStoredError);
    expect(scene.mail.queued).toEqual([]);
    expect(scene.log.rows.size).toBe(0);
  });

  it("le papier déjà rangé de la version sert tel quel, sans être refait", async () => {
    const store = new InMemoryProductionStore();
    const key = dayDossierPdfKey(DAY, CLOSED, null, 2);
    await store.save(key, { bytes: Buffer.from("%PDF-rangé"), contentType: "application/pdf" });
    const scene = resendScene([PAUL], dayAt(2), NOW, { store, traces: [sent("r-paul", 1)] });

    await scene.handler.execute(toPaul());

    expect(store.objects.get(key)?.bytes.toString()).toBe("%PDF-rangé");
    expect(scene.mail.queued).toHaveLength(1);
  });

  it("le rejeu de la même clé par le même auteur ne renvoie rien de plus", async () => {
    const scene = resendScene([PAUL], dayAt(2), NOW, { traces: [sent("r-paul", 1)] });

    await scene.handler.execute(toPaul("k-same"));
    await scene.handler.execute(toPaul("k-same"));

    expect(scene.mail.queued).toHaveLength(1);
  });

  it("l'auteur porte l'intention : la même clé chez un autre membre du staff est son propre geste", async () => {
    const scene = resendScene([PAUL], dayAt(2), NOW, { traces: [sent("r-paul", 1)] });

    await scene.handler.execute(toPaul("k-same", "s-marie"));
    // Même instant de renvoi, même ligne : la trace refuse de la reprendre, rien ne repart.
    await scene.handler.execute(toPaul("k-same", "s-hugo"));

    expect(scene.mail.queued).toHaveLength(1);
  });
});
