import type { MailDemand } from "../../../channels/requests/mail.js";
import { MAIL_RESUME_WINDOW_MS, MAX_MAIL_ATTEMPTS } from "../../domain/entities/mail-request.js";
import { MailInFlightError } from "../../domain/errors/mail-request.errors.js";
import { MAIL_STALE_AFTER_MS, MAIL_SWEEP_BATCH } from "../sweep-mail-requests.handler.js";
import { mailScene } from "./mail-doubles.js";

/*
 * Le balayeur des e-mails, S1b (plan `plan-service-e-mails.md`, § 8, point 3) :
 * reprise des orphelins et des échecs avec la même clé ; renoncement au-delà
 * de 23 h ou du plafond. Toutes les dates sont relatives à l'horloge fixe.
 */

type Scene = ReturnType<typeof mailScene>;

function demand(key: string): MailDemand<"staff.access-suspended"> {
  return {
    template: "staff.access-suspended",
    to: "equipe@example.test",
    data: { firstName: "Ada" },
    idempotencyKey: key,
  };
}

/** Une demande engagée dont l'envoi d'après validation n'a jamais eu lieu. */
async function orphan(scene: Scene, key: string): Promise<void> {
  scene.probe.open = true;
  await scene.port.send(demand(key));
  const fact = scene.facts.facts.at(-1);
  if (fact === undefined) {
    throw new TypeError("aucun fait écrit");
  }
  await scene.subscriber.handle({ eventId: key, type: fact.type, payload: fact.payload });
  scene.afterCommit.discard();
  scene.probe.open = false;
}

const LATER = MAIL_STALE_AFTER_MS + 1;

describe("le balayeur des e-mails", () => {
  it("reprend un `sending` orphelin, avec la même clé, et l'écrit `sent`", async () => {
    const scene = mailScene();
    await orphan(scene, "k:orphan");
    scene.clock.advanceMs(LATER);

    const report = await scene.sweeper.execute();

    expect(report).toMatchObject({ examined: 1, sent: 1 });
    expect(scene.dispatch.sent.map((mail) => mail.idempotencyKey)).toEqual(["k:orphan"]);
    expect(scene.requests.rows.get("k:orphan")?.snapshot()).toMatchObject({
      status: "sent",
      attempts: 2,
    });
  });

  it("laisse un envoi récent : il n'est pas encore orphelin", async () => {
    const scene = mailScene();
    await orphan(scene, "k:fresh");
    scene.clock.advanceMs(MAIL_STALE_AFTER_MS - 1);

    expect(await scene.sweeper.execute()).toMatchObject({ examined: 0 });
    expect(scene.dispatch.sent).toEqual([]);
  });

  it("reprend un `failed` reprenable", async () => {
    const scene = mailScene();
    await orphan(scene, "k:failed");
    scene.dispatch.failWith = new TypeError("réseau");
    scene.clock.advanceMs(LATER);
    expect(await scene.sweeper.execute()).toMatchObject({ failed: 1 });

    scene.clock.advanceMs(LATER);
    expect(await scene.sweeper.execute()).toMatchObject({ sent: 1 });
    expect(scene.requests.rows.get("k:failed")?.snapshot().attempts).toBe(3);
  });

  it("passe `failed` sans envoi un orphelin de plus de 23 h", async () => {
    const scene = mailScene();
    await orphan(scene, "k:old");
    scene.clock.advanceMs(MAIL_RESUME_WINDOW_MS);

    const report = await scene.sweeper.execute();

    expect(report).toMatchObject({ examined: 1, abandoned: 1, sent: 0 });
    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.get("k:old")?.snapshot()).toMatchObject({ status: "failed" });
    expect(scene.requests.rows.get("k:old")?.snapshot().failureReason).toContain("23 h");
  });

  it("n'en reprend plus au plafond d'essais", async () => {
    const scene = mailScene();
    await orphan(scene, "k:cap");
    for (let attempt = 1; attempt < MAX_MAIL_ATTEMPTS; attempt += 1) {
      scene.dispatch.failWith = new TypeError("réseau");
      scene.clock.advanceMs(LATER);
      await scene.sweeper.execute();
    }
    scene.clock.advanceMs(LATER);

    expect(await scene.sweeper.execute()).toMatchObject({ examined: 0 });
    expect(scene.requests.rows.get("k:cap")?.snapshot()).toMatchObject({
      status: "failed",
      attempts: MAX_MAIL_ATTEMPTS,
    });
    expect(scene.dispatch.sent).toEqual([]);
  });

  it("un 409 de même clé en cours laisse la demande `sending`", async () => {
    const scene = mailScene();
    await orphan(scene, "k:busy");
    scene.dispatch.failWith = new MailInFlightError();
    scene.clock.advanceMs(LATER);

    expect(await scene.sweeper.execute()).toMatchObject({ inFlight: 1 });
    expect(scene.requests.rows.get("k:busy")?.snapshot()).toMatchObject({
      status: "sending",
      attempts: 2,
    });
  });

  it("ne renvoie pas une demande dont le fait d'origine manque", async () => {
    const scene = mailScene();
    await orphan(scene, "k:nofact");
    scene.facts.facts.length = 0;
    scene.clock.advanceMs(LATER);

    expect(await scene.sweeper.execute()).toMatchObject({ missingFact: 1 });
    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.get("k:nofact")?.status).toBe("sending");
  });

  it("borne un passage au lot", async () => {
    const scene = mailScene();
    for (let index = 0; index <= MAIL_SWEEP_BATCH; index += 1) {
      await orphan(scene, `k:batch:${index}`);
    }
    scene.clock.advanceMs(LATER);

    expect(await scene.sweeper.execute()).toMatchObject({ examined: MAIL_SWEEP_BATCH });
  });

  it("ignore un échec de `sendAndAwaitReceipt` : l'équipe a vu l'erreur, à elle de refaire le geste", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new TypeError("réseau");
    await expect(scene.port.sendAndAwaitReceipt(demand("k:now"))).rejects.toThrow(TypeError);
    scene.clock.advanceMs(LATER);

    expect(await scene.sweeper.execute()).toMatchObject({ examined: 0 });
  });
});

describe("le balayeur applique les retours manqués (suivi des e-mails, T1)", () => {
  const BOUNCED = { delivery: "bounced", kind: "Permanent", at: new Date(5_000) } as const;

  it("applique un retour rangé que la demande ne porte pas encore", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:missed"));
    // Rangé sans avoir été appliqué : le webhook a échoué après le rangement.
    scene.deliveries.record("re_1", BOUNCED);

    const report = await scene.sweeper.execute();

    expect(report).toMatchObject({ examined: 0, deliveriesApplied: 1 });
    expect(scene.requests.rows.get("k:missed")?.snapshot()).toMatchObject({
      delivery: "bounced",
      deliveryKind: "Permanent",
    });
  });

  it("un second passage n'applique plus rien", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:once"));
    scene.deliveries.record("re_1", BOUNCED);
    await scene.sweeper.execute();

    expect(await scene.sweeper.execute()).toMatchObject({ deliveriesApplied: 0 });
  });

  it("laisse un retour sans demande : il attend sa demande, puis la purge", async () => {
    const scene = mailScene();
    scene.deliveries.record("re_inconnu", BOUNCED);

    expect(await scene.sweeper.execute()).toMatchObject({ deliveriesApplied: 0 });
  });
});
