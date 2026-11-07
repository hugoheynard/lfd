import { MailerInvalidReplyToError, MailerSendError } from "@lfd/mailer";

import type { MailDemand } from "../../../channels/requests/mail.js";
import {
  ImmediateMailInsideUnitOfWorkError,
  MailRefusedError,
  MailRequestAlreadySettledError,
  MailRequestOutsideUnitOfWorkError,
} from "../../domain/errors/mail-request.errors.js";
import { MAIL_REQUESTED } from "../mail-requested.fact.js";
import { mailScene } from "./mail-doubles.js";

const SUSPENDED: MailDemand<"staff.access-suspended"> = {
  template: "staff.access-suspended",
  to: "equipe@example.test",
  data: { firstName: "Ada" },
  brand: "lfc",
  idempotencyKey: "staff.suspended:s1",
};

describe("request — la demande différée", () => {
  it("écrit le suivi ET le fait mail.requested, sans rien envoyer", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.send(SUSPENDED);

    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.facts.facts).toEqual([
      {
        type: MAIL_REQUESTED,
        key: "mail.requested:staff.suspended:s1",
        payload: {
          template: "staff.access-suspended",
          to: "equipe@example.test",
          data: { firstName: "Ada" },
          idempotencyKey: "staff.suspended:s1",
        },
      },
    ]);
    expect(scene.requests.rows.get("staff.suspended:s1")?.snapshot()).toMatchObject({
      status: "requested",
      recipient: "equipe@example.test",
      locale: null,
    });
  });

  it("refuse hors d'une unité de travail, avant toute écriture", async () => {
    const scene = mailScene();

    await expect(scene.port.send(SUSPENDED)).rejects.toThrow(MailRequestOutsideUnitOfWorkError);
    expect(scene.requests.rows.size).toBe(0);
    expect(scene.facts.facts).toEqual([]);
  });

  it("une seconde demande de même clé n'écrit rien", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.send(SUSPENDED);
    await scene.port.send(SUSPENDED);

    expect(scene.facts.facts).toHaveLength(1);
    expect(scene.requests.rows.size).toBe(1);
  });
});

// L'abonné durable (S1b) : `deliver-requested-mail.spec.ts`.

describe("sendAndAwaitReceipt — l'envoi immédiat", () => {
  it("envoie, rend le reçu, puis écrit le suivi", async () => {
    const scene = mailScene();

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).resolves.toEqual({
      providerId: "re_1",
    });
    expect(scene.dispatch.sent).toHaveLength(1);
    expect(scene.requests.rows.get("staff.suspended:s1")?.snapshot()).toMatchObject({
      status: "sent",
      providerId: "re_1",
    });
  });

  /** Plan de l'éditeur par blocs, § 5 : la demande dit quel texte est parti, pas seulement quel modèle. */
  it("garde sur la demande la version du document publié qui a composé l'envoi", async () => {
    const scene = mailScene();
    scene.dispatch.documentVersion = 5;

    await scene.port.sendAndAwaitReceipt(SUSPENDED);
    expect(scene.requests.rows.get("staff.suspended:s1")?.snapshot()).toMatchObject({
      status: "sent",
      documentVersion: 5,
    });
  });

  it("refuse sous une unité de travail, sans rien envoyer ni écrire", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).rejects.toThrow(
      ImmediateMailInsideUnitOfWorkError,
    );
    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.size).toBe(0);
  });

  it("une clé déjà envoyée ne repart pas : le reçu suivi est rendu", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(SUSPENDED);

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).resolves.toEqual({
      providerId: "re_1",
    });
    expect(scene.dispatch.sent).toHaveLength(1);
  });

  it("un échec technique est suivi `failed`, l'erreur remonte, et un nouvel essai part", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new MailerSendError("Resend injoignable");

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).rejects.toThrow(MailerSendError);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("failed");

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).resolves.toEqual({
      providerId: "re_1",
    });
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("sent");
  });

  it("un refus est suivi `refused` et la clé ne repart plus", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new MailRefusedError(
      "adresse invalide.",
      new MailerInvalidReplyToError(),
    );

    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).rejects.toThrow(MailRefusedError);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("refused");
    await expect(scene.port.sendAndAwaitReceipt(SUSPENDED)).rejects.toThrow(
      MailRequestAlreadySettledError,
    );
    expect(scene.dispatch.sent).toEqual([]);
  });
});
