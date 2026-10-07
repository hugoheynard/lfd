import { Logger } from "@nestjs/common";

import { CommitQueue, runInTransaction } from "../../../../platform/database/transaction.store.js";
import {
  CLOSED,
  closedDay,
  closure,
  DAY,
  GUARD_TX,
  JEANNE,
  PAUL,
  retake,
  retakenDay,
  settle,
  setup,
  UnreadableArchive,
  UnreadableDay,
  UnreadableRecipients,
} from "./send-dossier-scene.js";

/*
 * **Le dossier part APRÈS la validation du reçu** (audit du 2026-10-07, B1).
 * La garde fait tourner l'abonné dans la transaction qui pose son reçu : la
 * journée et les destinataires s'y lisent — illisibles, la livraison sera
 * rejouée ; le papier, la trace et les envois suivent la validation, et une
 * panne n'y est jamais muette.
 */

/** Ce que `Logger.<level>` a reçu pendant `work`. */
async function captured(
  level: "error" | "warn",
  work: () => Promise<void>,
): Promise<readonly string[]> {
  // Le dépôt tourne en ESM, sans `jest` global : on remplace la méthode du
  // Logger à la main, et on la rend quoi qu'il arrive.
  const logged: string[] = [];
  const original = Object.getOwnPropertyDescriptor(Logger.prototype, level);
  Object.defineProperty(Logger.prototype, level, {
    configurable: true,
    writable: true,
    value: (message: unknown): void => {
      logged.push(String(message));
    },
  });
  try {
    await work();
  } finally {
    if (original !== undefined) {
      Object.defineProperty(Logger.prototype, level, original);
    }
  }
  return logged;
}

describe("le dossier part après la validation du reçu", () => {
  /**
   * Régression (audit du 2026-10-07, B1) : le dossier partait DANS la
   * transaction que la garde ouvre pour poser le reçu — le PDF, puis un envoi
   * par destinataire, une connexion du pool tenue. Passé le délai, la
   * transaction tombait avec le reçu et la trace `claim`/`settle`, et le fait
   * relivré redemandait chaque envoi.
   */
  it("🔴 à l'arrêt, n'envoie pas dans la transaction de la garde : rien n'est même pris avant", async () => {
    const { handlers, mailer, log, work } = setup([PAUL, JEANNE]);
    const commits = new CommitQueue();

    await runInTransaction(GUARD_TX, () => handlers.closed.handle(closure()), commits);
    await settle();
    expect(mailer.sent).toEqual([]);
    expect(log.rows.size).toBe(0);

    commits.flush();
    await work.whenIdle();
    expect(mailer.sent.map((mail) => mail.to)).toEqual(["paul@fournil.fr", "jeanne@imprimerie.fr"]);
    expect(mailer.underTransaction).toEqual([false, false]);
  });

  it("🔴 au retirage non plus : le dossier complété part après la validation", async () => {
    const { handlers, mailer, work } = setup([PAUL], retakenDay());
    const commits = new CommitQueue();

    await runInTransaction(GUARD_TX, () => handlers.retaken.handle(retake()), commits);
    await settle();
    expect(mailer.sent).toEqual([]);

    commits.flush();
    await work.whenIdle();
    expect(mailer.sent.map((mail) => mail.data)).toMatchObject([{ completed: true }]);
    expect(mailer.underTransaction).toEqual([false]);
  });

  it.each([
    ["la journée", "l'arrêt", "closed", { days: new UnreadableDay() }, "journée illisible"],
    ["la journée", "le retirage", "retaken", { days: new UnreadableDay() }, "journée illisible"],
    [
      "la liste des destinataires",
      "l'arrêt",
      "closed",
      { recipients: new UnreadableRecipients() },
      "liste des destinataires illisible",
    ],
    [
      "la liste des destinataires",
      "le retirage",
      "retaken",
      { recipients: new UnreadableRecipients() },
      "liste des destinataires illisible",
    ],
  ] as const)(
    "%s illisible fait échouer %s dans la transaction : rejoué, et rien n'est inscrit",
    async (_what, _case, which, options, failure) => {
      const scene = setup([PAUL], which === "closed" ? closedDay() : retakenDay(), options);
      const delivery = which === "closed" ? closure() : retake();
      const commits = new CommitQueue();

      await expect(
        runInTransaction(GUARD_TX, () => scene.handlers[which].handle(delivery), commits),
      ).rejects.toThrow(failure);
      commits.flush();
      await scene.work.whenIdle();

      expect(scene.mailer.sent).toEqual([]);
      expect(scene.log.rows.size).toBe(0);
      expect(scene.bell.notices).toEqual([]);
    },
  );

  /**
   * Régression (complément B1, 2026-10-07) : sortie de la transaction, la
   * fabrication du papier n'était plus rejouée — une panne n'y laissait
   * qu'une ligne de log, et personne ne savait que le dossier n'était pas
   * parti.
   */
  it("🔴 un papier qui ne se fabrique pas après la validation sonne la cloche pour tous, et se journalise", async () => {
    const { closed, mailer, log, bell, events } = setup([PAUL, JEANNE], closedDay(), {
      store: new UnreadableArchive(),
    });

    const errors = await captured("error", () => closed.handle(closure()));

    expect(mailer.sent).toEqual([]);
    expect(log.rows.size).toBe(0);
    expect(events.traced).toEqual([]);
    expect(bell.notices).toHaveLength(1);
    expect(bell.notices[0]).toMatchObject({
      kind: "production.dossier_not_prepared",
      audience: "production_count_stop:write",
      idempotencyKey: `notification:production.dossier_not_prepared:${DAY}:${CLOSED.toISOString()}`,
    });
    expect(bell.notices[0]?.body).toContain("Paul Martin, Jeanne Roux");
    // Une seule erreur : `deliver` n'a pas levé, le travail de fond n'a rien à dire.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`Dossier du ${DAY} non fabriqué`);
    expect(errors[0]).not.toMatch(/Paul|Jeanne|@/);
  });

  it("des envois refusés après la validation sonnent la cloche et se journalisent, sans nom ni adresse au log", async () => {
    const { closed, mailer, bell } = setup([PAUL, JEANNE]);
    mailer.refused.add("paul@fournil.fr");
    mailer.refused.add("jeanne@imprimerie.fr");

    const warnings = await captured("warn", () => closed.handle(closure()));

    expect(mailer.sent).toEqual([]);
    expect(bell.notices.map((notice) => notice.kind)).toEqual(["production.dossier_not_sent"]);
    expect(bell.notices[0]?.subject).toContain("Paul Martin, Jeanne Roux");
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).not.toMatch(/Paul|Jeanne|@/);
  });
});
