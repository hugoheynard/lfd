import type { MailDemand } from "../../../channels/requests/mail.js";
import { MarketingMailRefusedError } from "../../domain/errors/mail-request.errors.js";
import { MAIL_STALE_AFTER_MS } from "../sweep-mail-requests.handler.js";
import { mailScene } from "./mail-doubles.js";

/*
 * Le contrôle marketing sur les TROIS chemins d'envoi (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, B3) : l'envoi
 * immédiat, l'envoi différé d'après validation, et la reprise du balayeur —
 * qui revérifie à CHAQUE tentative. Le contrôle est joué par le test ; son
 * implémentation par le registre a sa propre suite (`marketing/`).
 */

type Scene = ReturnType<typeof mailScene>;

const DEMAND: MailDemand<"staff.access-suspended"> = {
  template: "staff.access-suspended",
  to: "equipe@example.test",
  data: { firstName: "Ada" },
  idempotencyKey: "k:offer",
};

function refuse(scene: Scene): void {
  scene.clearance.verdicts.set(DEMAND.template, { kind: "refused", code: "unsubscribed" });
}

/** La demande validée, son envoi d'après validation joué. */
async function deferred(scene: Scene): Promise<void> {
  scene.probe.open = true;
  await scene.port.send(DEMAND);
  const fact = scene.facts.facts.at(-1);
  if (fact === undefined) {
    throw new TypeError("aucun fait écrit");
  }
  await scene.subscriber.handle({ eventId: "e1", type: fact.type, payload: fact.payload });
  scene.probe.open = false;
  await scene.afterCommit.commit();
}

describe("le contrôle marketing, sur les trois chemins (B3)", () => {
  it("immédiat : la fiche est écrite `refused`, rien ne part, l'appelant le lit", async () => {
    const scene = mailScene();
    refuse(scene);

    await expect(scene.port.sendAndAwaitReceipt(DEMAND)).rejects.toBeInstanceOf(
      MarketingMailRefusedError,
    );

    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.get("k:offer")?.snapshot()).toMatchObject({
      status: "refused",
      refusalCode: "unsubscribed",
    });
  });

  it("différé : refusé après validation, rien ne part", async () => {
    const scene = mailScene();
    refuse(scene);

    await deferred(scene);

    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.get("k:offer")?.snapshot()).toMatchObject({
      status: "refused",
      refusalCode: "unsubscribed",
    });
  });

  it("reprise du balayeur : une désinscription arrivée entre deux essais arrête le suivant", async () => {
    const scene = mailScene();
    scene.dispatch.failWith = new TypeError("réseau");
    await deferred(scene);
    expect(scene.requests.rows.get("k:offer")?.snapshot().status).toBe("failed");
    refuse(scene);
    scene.clock.advanceMs(MAIL_STALE_AFTER_MS + 1);

    await scene.sweeper.execute();

    expect(scene.dispatch.sent).toEqual([]);
    expect(scene.requests.rows.get("k:offer")?.snapshot()).toMatchObject({
      status: "refused",
      refusalCode: "unsubscribed",
    });
    // Le contrôle a été posé à CHAQUE essai : l'envoi d'après validation, puis la reprise.
    expect(scene.clearance.asked).toHaveLength(2);
  });

  it("un e-mail autorisé emporte ses marques jusqu'au transport", async () => {
    const scene = mailScene();
    const marks = { unsubscribeUrl: "https://shop.lfc.test/api/lfd/mail/unsubscribe/t" };
    scene.clearance.verdicts.set(DEMAND.template, { kind: "cleared", marks });

    await scene.port.sendAndAwaitReceipt(DEMAND);

    expect(scene.dispatch.marks).toEqual([marks]);
    expect(scene.clearance.asked).toEqual([
      { template: DEMAND.template, space: "lfd", recipient: DEMAND.to },
    ]);
  });
});
