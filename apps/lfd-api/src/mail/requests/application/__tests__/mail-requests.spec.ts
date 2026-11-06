import { MailerInvalidReplyToError, MailerSendError } from "@lfd/mailer";

import type { MailDemand } from "../../../channels/requests/mail-requests.js";
import {
  ImmediateMailInsideUnitOfWorkError,
  MailRefusedError,
  MailRequestAlreadySettledError,
  MailRequestMissingError,
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

type Scene = ReturnType<typeof mailScene>;

/** La livraison du fait écrit, telle que la boîte d'envoi la ferait. */
async function deliverLast(scene: Scene): Promise<void> {
  const fact = scene.facts.facts.at(-1);
  if (fact === undefined) {
    throw new TypeError("aucun fait à livrer");
  }
  await scene.subscriber.handle({ eventId: "outbox_1", type: fact.type, payload: fact.payload });
}

describe("request — la demande différée", () => {
  it("écrit le suivi ET le fait mail.requested, sans rien envoyer", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.request(SUSPENDED);

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

    await expect(scene.port.request(SUSPENDED)).rejects.toThrow(MailRequestOutsideUnitOfWorkError);
    expect(scene.requests.rows.size).toBe(0);
    expect(scene.facts.facts).toEqual([]);
  });

  it("une seconde demande de même clé n'écrit rien", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await scene.port.request(SUSPENDED);
    await scene.port.request(SUSPENDED);

    expect(scene.facts.facts).toHaveLength(1);
    expect(scene.requests.rows.size).toBe(1);
  });
});

describe("l'abonné durable — l'envoi après la validation", () => {
  it("envoie une fois, avec la clé d'idempotence, et suit l'envoi", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request(SUSPENDED);

    await deliverLast(scene);

    expect(scene.dispatch.sent).toEqual([
      {
        template: "staff.access-suspended",
        to: "equipe@example.test",
        data: { firstName: "Ada" },
        idempotencyKey: "staff.suspended:s1",
      },
    ]);
    expect(scene.requests.rows.get("staff.suspended:s1")?.snapshot()).toMatchObject({
      status: "sent",
      providerId: "re_1",
    });
  });

  it("un rejeu de la livraison n'envoie pas une seconde fois", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request(SUSPENDED);

    await deliverLast(scene);
    await deliverLast(scene);

    expect(scene.dispatch.sent).toHaveLength(1);
  });

  it("un échec technique fait échouer la livraison, sans rien ranger — elle sera rejouée", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request(SUSPENDED);
    scene.dispatch.failWith = new MailerSendError("Resend injoignable");

    await expect(deliverLast(scene)).rejects.toThrow(MailerSendError);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("requested");

    await deliverLast(scene);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("sent");
  });

  it("un refus ferme la demande sans faire échouer la livraison", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request(SUSPENDED);
    scene.dispatch.failWith = new MailRefusedError("adresse de réponse invalide.");

    await deliverLast(scene);

    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("refused");
    await deliverLast(scene);
    expect(scene.dispatch.sent).toEqual([]);
  });

  it("refuse un fait livré sans sa ligne de suivi", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request(SUSPENDED);
    scene.requests.rows.clear();

    await expect(deliverLast(scene)).rejects.toThrow(MailRequestMissingError);
    expect(scene.dispatch.sent).toEqual([]);
  });
});

describe("sendNow — l'envoi immédiat", () => {
  it("envoie, rend le reçu, puis écrit le suivi", async () => {
    const scene = mailScene();

    await expect(scene.port.sendNow(SUSPENDED)).resolves.toEqual({ providerId: "re_1" });
    expect(scene.dispatch.sent).toHaveLength(1);
    expect(scene.requests.rows.get("staff.suspended:s1")?.snapshot()).toMatchObject({
      status: "sent",
      providerId: "re_1",
    });
  });

  it("refuse sous une unité de travail, sans rien envoyer ni écrire", async () => {
    const scene = mailScene();
    scene.probe.open = true;

    await expect(scene.port.sendNow(SUSPENDED)).rejects.toThrow(ImmediateMailInsideUnitOfWorkError);
    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.size).toBe(0);
  });

  it("une clé déjà envoyée ne repart pas : le reçu suivi est rendu", async () => {
    const scene = mailScene();
    await scene.port.sendNow(SUSPENDED);

    await expect(scene.port.sendNow(SUSPENDED)).resolves.toEqual({ providerId: "re_1" });
    expect(scene.dispatch.sent).toHaveLength(1);
  });

  it("un échec technique est suivi `failed`, l'erreur remonte, et un nouvel essai part", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new MailerSendError("Resend injoignable");

    await expect(scene.port.sendNow(SUSPENDED)).rejects.toThrow(MailerSendError);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("failed");

    await expect(scene.port.sendNow(SUSPENDED)).resolves.toEqual({ providerId: "re_1" });
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("sent");
  });

  it("un refus est suivi `refused` et la clé ne repart plus", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new MailRefusedError(
      "adresse invalide.",
      new MailerInvalidReplyToError(),
    );

    await expect(scene.port.sendNow(SUSPENDED)).rejects.toThrow(MailRefusedError);
    expect(scene.requests.rows.get("staff.suspended:s1")?.status).toBe("refused");
    await expect(scene.port.sendNow(SUSPENDED)).rejects.toThrow(MailRequestAlreadySettledError);
    expect(scene.dispatch.sent).toEqual([]);
  });
});
