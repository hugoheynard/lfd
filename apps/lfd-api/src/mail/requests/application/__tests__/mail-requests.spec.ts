import { MailerInvalidReplyToError, MailerSendError } from "@lfd/mailer";

import type { MailDemand } from "../../../channels/requests/mail.js";
import {
  ImmediateMailInsideUnitOfWorkError,
  InvalidMailRequestError,
  MailRefusedError,
  MailRequestAlreadySettledError,
  MailRequestOutsideUnitOfWorkError,
} from "../../domain/errors/mail-request.errors.js";
import { MAIL_REQUESTED, outgoingMailOf } from "../mail-requested.fact.js";
import { mailScene } from "./mail-doubles.js";

const SUSPENDED: MailDemand<"staff.access-suspended"> = {
  template: "staff.access-suspended",
  to: "equipe@example.test",
  data: { firstName: "Ada" },
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
      // C3 : la marque est l'espace du modèle, jamais l'appelant.
      brand: "lfd",
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

/** Le sujet des e-mails (`le-sujet-des-e-mails.md`, E1) : rangé à la demande, porté par le fait. */
describe("les sujets d'une demande", () => {
  const ORDER = { type: "order", id: "ord_1" } as const;
  const WITH_SUBJECT: MailDemand<"staff.access-suspended"> = { ...SUSPENDED, subjects: [ORDER] };

  it("send : la fiche les range, et le fait différé les porte à travers la boîte d'envoi", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.send(WITH_SUBJECT);

    expect(scene.requests.rows.get("staff.suspended:s1")?.subjects).toEqual([ORDER]);
    const fact = scene.facts.facts[0];
    expect(fact?.payload).toMatchObject({ subjects: [ORDER] });
    expect(outgoingMailOf(fact?.payload ?? {}).subjects).toEqual([ORDER]);
  });

  it("send sans sujet : ni fiche ni fait n'en inventent", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.send(SUSPENDED);

    expect(scene.requests.rows.get("staff.suspended:s1")?.subjects).toEqual([]);
    expect(scene.facts.facts[0]?.payload).not.toHaveProperty("subjects");
  });

  it("sendAndAwaitReceipt : la fiche écrite après l'envoi les range", async () => {
    const scene = mailScene();

    await scene.port.sendAndAwaitReceipt(WITH_SUBJECT);

    expect(scene.requests.rows.get("staff.suspended:s1")?.subjects).toEqual([ORDER]);
  });

  it("refuse un fait rejoué dont un sujet est mal formé", () => {
    const payload = {
      template: "staff.access-suspended",
      to: "equipe@example.test",
      data: {},
      idempotencyKey: "k",
      subjects: [{ type: "order", id: "" }],
    };
    expect(() => outgoingMailOf(payload)).toThrow(InvalidMailRequestError);
    expect(() => outgoingMailOf({ ...payload, subjects: "order" })).toThrow(
      InvalidMailRequestError,
    );
  });
});
