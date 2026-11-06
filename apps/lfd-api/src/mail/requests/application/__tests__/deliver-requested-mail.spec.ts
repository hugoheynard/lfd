import { MailerSendError } from "@lfd/mailer";

import type { MailDemand } from "../../../channels/requests/mail-requests.js";
import {
  InvalidMailRequestError,
  MailInFlightError,
  MailRefusedError,
  MailRequestMissingError,
} from "../../domain/errors/mail-request.errors.js";
import { MAIL_REQUESTED } from "../mail-requested.fact.js";
import { mailScene } from "./mail-doubles.js";

/*
 * L'abonné durable, S1b (plan `plan-service-e-mails.md`, § 8) : dans la
 * transaction de livraison il ne fait QUE passer la demande en `sending` ;
 * l'envoi part après la validation (`HeldAfterCommit.commit()`), et son
 * résultat s'écrit ensuite.
 */

const SUSPENDED: MailDemand<"staff.access-suspended"> = {
  template: "staff.access-suspended",
  to: "equipe@example.test",
  data: { firstName: "Ada" },
  brand: "lfc",
  idempotencyKey: "staff.suspended:s1b",
};

type Scene = ReturnType<typeof mailScene>;

async function requested(): Promise<Scene> {
  const scene = mailScene();
  scene.probe.open = true;
  await scene.port.request(SUSPENDED);
  return scene;
}

/** La livraison du fait écrit, telle que la boîte d'envoi la ferait. */
async function deliverLast(scene: Scene): Promise<void> {
  const fact = scene.facts.facts.at(-1);
  if (fact === undefined) {
    throw new TypeError("aucun fait à livrer");
  }
  await scene.subscriber.handle({ eventId: "outbox_1", type: fact.type, payload: fact.payload });
}

function rowOf(scene: Scene) {
  return scene.requests.rows.get(SUSPENDED.idempotencyKey)?.snapshot();
}

describe("l'abonné durable — marquer dans la transaction, envoyer après", () => {
  it("dans la livraison : passe en `sending` et range, sans rien envoyer", async () => {
    const scene = await requested();

    await deliverLast(scene);

    expect(scene.dispatch.sent).toEqual([]);
    expect(rowOf(scene)).toMatchObject({
      status: "sending",
      attempts: 1,
      firstAttemptAt: scene.clock.now(),
      lastAttemptAt: scene.clock.now(),
    });
  });

  it("après la validation : envoie une fois, avec la clé, et écrit `sent`", async () => {
    const scene = await requested();
    await deliverLast(scene);

    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toEqual([
      {
        template: "staff.access-suspended",
        to: "equipe@example.test",
        data: { firstName: "Ada" },
        idempotencyKey: "staff.suspended:s1b",
      },
    ]);
    expect(rowOf(scene)).toMatchObject({ status: "sent", providerId: "re_1" });
  });

  it("le Reply-To traverse le fait jusqu'à l'envoi, et n'entre pas au suivi (S2c)", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.request({ ...SUSPENDED, replyTo: "auteur@example.test" });
    expect(scene.facts.facts[0]?.payload).toMatchObject({ replyTo: "auteur@example.test" });
    await deliverLast(scene);

    await scene.afterCommit.commit();

    expect(scene.dispatch.sent[0]).toMatchObject({ replyTo: "auteur@example.test" });
    expect(JSON.stringify(rowOf(scene))).not.toContain("auteur@example.test");
  });

  it("un fait dont le Reply-To n'est pas une chaîne est refusé, pas deviné", async () => {
    const scene = await requested();
    const fact = scene.facts.facts[0];
    await expect(
      scene.subscriber.handle({
        eventId: "outbox_1",
        type: MAIL_REQUESTED,
        payload: { ...fact?.payload, replyTo: 42 },
      }),
    ).rejects.toThrow(InvalidMailRequestError);
  });

  it("une livraison annulée n'envoie rien", async () => {
    const scene = await requested();
    await deliverLast(scene);

    scene.afterCommit.discard();
    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toEqual([]);
  });

  it("un rejeu de la livraison sur une demande `sending` ne réengage rien", async () => {
    const scene = await requested();
    await deliverLast(scene);
    await deliverLast(scene);

    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toHaveLength(1);
    expect(rowOf(scene)?.attempts).toBe(1);
  });

  it("un rejeu après l'envoi n'envoie pas une seconde fois", async () => {
    const scene = await requested();
    await deliverLast(scene);
    await scene.afterCommit.commit();

    await deliverLast(scene);
    await scene.afterCommit.commit();

    expect(scene.dispatch.sent).toHaveLength(1);
  });

  it("un échec technique après la validation est écrit `failed`, sans lever", async () => {
    const scene = await requested();
    await deliverLast(scene);
    scene.dispatch.failWith = new MailerSendError("Resend injoignable");

    await scene.afterCommit.commit();

    expect(rowOf(scene)).toMatchObject({ status: "failed", attempts: 1 });
    expect(rowOf(scene)?.failureReason).toContain("Resend injoignable");
  });

  it("un refus après la validation ferme la demande", async () => {
    const scene = await requested();
    await deliverLast(scene);
    scene.dispatch.failWith = new MailRefusedError("adresse de réponse invalide.");

    await scene.afterCommit.commit();

    expect(rowOf(scene)?.status).toBe("refused");
  });

  it("un 409 de même clé en cours laisse la demande `sending`", async () => {
    const scene = await requested();
    await deliverLast(scene);
    scene.dispatch.failWith = new MailInFlightError();

    await scene.afterCommit.commit();

    expect(rowOf(scene)).toMatchObject({ status: "sending", attempts: 1, failedAt: null });
  });

  it("refuse un fait livré sans sa ligne de suivi", async () => {
    const scene = await requested();
    scene.requests.rows.clear();

    await expect(deliverLast(scene)).rejects.toThrow(MailRequestMissingError);
    await scene.afterCommit.commit();
    expect(scene.dispatch.sent).toEqual([]);
  });
});
