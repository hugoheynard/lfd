import {
  MAIL_DELIVERY_FAILED,
  MailDeliveryFailedEvent,
} from "../../../channels/deliveries/mail-delivery-failed.event.js";
import type { MailDemand } from "../../../channels/requests/mail.js";
import { MailRequest } from "../../domain/entities/mail-request.js";
import type { MailDeliveryReport } from "../../domain/value-objects/mail-delivery.js";
import { MAIL_STALE_AFTER_MS } from "../sweep-mail-requests.handler.js";
import { mailScene } from "./mail-doubles.js";

/*
 * Le fait `mail.delivery_failed` (`plan-sujet-des-e-mails.md`, E4, règle 4) :
 * un seul point d'émission — l'agrégat décide, le dépôt l'écrit avec la
 * demande —, quel que soit le chemin qui applique le retour. Les instants
 * ne sont comparés qu'entre eux.
 */

type Scene = ReturnType<typeof mailScene>;

const ORDER = { type: "order", id: "ord_1" } as const;
const BOUNCED: MailDeliveryReport = { delivery: "bounced", kind: "Permanent", at: new Date(5_000) };
const COMPLAINED: MailDeliveryReport = { delivery: "complained", kind: null, at: new Date(4_000) };

function demand(key: string, withSubject = true): MailDemand<"staff.access-suspended"> {
  return {
    template: "staff.access-suspended",
    to: "equipe@example.test",
    data: { firstName: "Ada" },
    idempotencyKey: key,
    ...(withSubject ? { subjects: [ORDER] } : {}),
  };
}

const failures = (scene: Scene) =>
  scene.facts.facts.filter((fact) => fact.type === MAIL_DELIVERY_FAILED);

describe("mail.delivery_failed — les trois chemins écrivent le même fait", () => {
  it("le webhook (`apply`) : le fait porte les sujets, sans adresse", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:hook"));

    await scene.applier.apply("re_1", BOUNCED);

    const [fact] = failures(scene);
    expect(fact?.key).toBe(`${MAIL_DELIVERY_FAILED}:mail_000001`);
    expect(MailDeliveryFailedEvent.fromPayload(fact?.payload ?? {}).fields).toEqual({
      requestId: "mail_000001",
      template: "staff.access-suspended",
      subjects: [ORDER],
      delivery: "bounced",
      kind: "Permanent",
      at: BOUNCED.at,
    });
    expect(JSON.stringify(fact)).not.toContain("@");
  });

  it("le balayeur (`applyUnapplied`) : un retour manqué écrit le fait", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:missed"));
    scene.deliveries.record("re_1", BOUNCED);

    await scene.sweeper.execute();

    expect(failures(scene).map((fact) => fact.payload["subjects"])).toEqual([[ORDER]]);
  });

  it("la pose de l'identifiant (`MailOutcomeRecorder`) : un rebond arrivé avant l'envoi", async () => {
    const scene = mailScene();
    scene.deliveries.record("re_1", BOUNCED);

    await scene.port.sendAndAwaitReceipt(demand("k:early"));

    expect(failures(scene)).toHaveLength(1);
    expect(failures(scene)[0]?.payload).toMatchObject({ subjects: [ORDER], delivery: "bounced" });
  });

  it("la reprise d'un orphelin par le balayeur relit un rebond déjà rangé", async () => {
    const scene = mailScene();
    scene.probe.open = true;
    await scene.port.send(demand("k:orphan"));
    const requested = scene.facts.facts[0];
    await scene.subscriber.handle({
      eventId: "e",
      type: requested?.type ?? "",
      payload: requested?.payload ?? {},
    });
    scene.afterCommit.discard();
    scene.probe.open = false;
    scene.deliveries.record("re_1", BOUNCED);
    scene.clock.advanceMs(MAIL_STALE_AFTER_MS + 1);

    await scene.sweeper.execute();

    expect(failures(scene).map((fact) => fact.payload["subjects"])).toEqual([[ORDER]]);
  });
});

describe("mail.delivery_failed — une fois par fiche", () => {
  it("deux fiches sur un même identifiant fournisseur : deux faits", async () => {
    const scene = mailScene();
    for (const id of ["mail_a", "mail_b"]) {
      const request = MailRequest.request({
        id,
        template: "customer.order-ready",
        brand: "lfc",
        recipient: "client@example.test",
        locale: "fr",
        idempotencyKey: `k:${id}`,
        requestedAt: new Date(0),
        subjects: [ORDER],
      });
      request.markSent("re_shared", new Date(1_000));
      await scene.requests.save(request);
    }

    expect(await scene.applier.apply("re_shared", BOUNCED)).toBe(2);

    expect(failures(scene).map((fact) => fact.key)).toEqual([
      `${MAIL_DELIVERY_FAILED}:mail_a`,
      `${MAIL_DELIVERY_FAILED}:mail_b`,
    ]);
  });

  it("une plainte puis un rebond : un seul fait", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:twice"));

    await scene.applier.apply("re_1", COMPLAINED);
    await scene.applier.apply("re_1", BOUNCED);

    expect(failures(scene).map((fact) => fact.payload["delivery"])).toEqual(["complained"]);
  });

  it("une demande sans sujet : aucun fait", async () => {
    const scene = mailScene();
    await scene.port.sendAndAwaitReceipt(demand("k:none", false));

    await scene.applier.apply("re_1", BOUNCED);

    expect(failures(scene)).toEqual([]);
  });
});
