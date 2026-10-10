/**
 * La boîte d'envoi, contre le vrai Postgres (plan
 * `documentation/journalisation/plan-boite-d-envoi.md`, BE1).
 *
 * Ce qu'un test unitaire ne peut pas dire : que la ligne tombe AVEC la
 * transaction, que `SKIP LOCKED` sépare deux relais, et que le reçu et l'effet
 * partent ensemble.
 */
import { CommandBus } from "@nestjs/cqrs";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { DurableFactOutsideUnitOfWorkError } from "../src/platform/outbox/outbox-errors.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { ReplayOutboxDeliveryCommand } from "../src/platform/outbox/replay-outbox-delivery.command.js";
import {
  DurableProbeModule,
  PROBE_SUBSCRIBER,
  ProbeCounter,
  ProbeHappened,
} from "./durable-probe.js";
import type { DeadLettersView } from "@lfd/contracts";

import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** L'émetteur a échoué APRÈS avoir écrit son fait. */
class EmitterFailed extends TypeError {}

/** Le staff des routes admin (messages morts) : l'opérateur semé par le harnais. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let publisher: DurablePublisher;
let unitOfWork: UnitOfWork;
let probe: ProbeCounter;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    imports: [DurableProbeModule],
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
  publisher = ctx.app.get(DurablePublisher);
  unitOfWork = ctx.app.get(UnitOfWork);
  probe = ctx.app.get(ProbeCounter);
});

beforeEach(async () => {
  await ctx.reset();
  probe.reset();
});

afterAll(async () => {
  await ctx.close();
});

function publish(probeId: string): Promise<void> {
  return unitOfWork.run(() => publisher.publish(new ProbeHappened(probeId).durableFact()));
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

/** Le temps passe : la reprise de l'abonné est échue. */
async function makeRetriesDue(): Promise<void> {
  await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
}

describe("la boîte d'envoi", () => {
  it("un fait écrit dans une transaction annulée n'existe pas, et n'est jamais livré", async () => {
    await expect(
      unitOfWork.run(async () => {
        await publisher.publish(new ProbeHappened("annule").durableFact());
        throw new EmitterFailed("l'émetteur tombe après avoir écrit");
      }),
    ).rejects.toThrow(EmitterFailed);
    await ctx.drain();
    await sweep();

    expect(await ctx.prisma.outboxMessage.count()).toBe(0);
    expect(probe.received).toEqual([]);
  });

  it("refuse un fait durable publié hors d'une unité de travail", async () => {
    await expect(publisher.publish(new ProbeHappened("nu").durableFact())).rejects.toThrow(
      DurableFactOutsideUnitOfWorkError,
    );
    expect(await ctx.prisma.outboxMessage.count()).toBe(0);
  });

  it("un fait écrit et validé est livré après la validation, reçu posé", async () => {
    await publish("valide");
    await ctx.drain();

    const message = await ctx.prisma.outboxMessage.findUniqueOrThrow({
      where: { key: "test.probe_happened:valide" },
      include: { deliveries: true },
    });
    expect(probe.received).toEqual([message.id]);
    expect(message.deliveries).toHaveLength(1);
    expect(message.deliveries[0]).toMatchObject({ subscriber: PROBE_SUBSCRIBER, attempts: 0 });
    expect(message.deliveries[0]?.deliveredAt).not.toBeNull();
  });

  it("un même fait annoncé deux fois ne s'écrit qu'une fois (clé déterministe)", async () => {
    await publish("deux-fois");
    await publish("deux-fois");
    await ctx.drain();

    expect(await ctx.prisma.outboxMessage.count()).toBe(1);
    expect(probe.received).toHaveLength(1);
  });

  it("un abonné qui échoue est noté, puis rejoué une fois son délai échu", async () => {
    probe.failuresLeft = 1;
    await publish("rejoue");
    await ctx.drain();

    const failed = await ctx.prisma.outboxDelivery.findFirstOrThrow();
    expect(failed).toMatchObject({ attempts: 1, deliveredAt: null, lastError: "sonde en panne" });
    expect(probe.received).toEqual([]);

    await makeRetriesDue();
    await sweep();

    expect(probe.received).toEqual([failed.eventId]);
  });

  it("une livraison en double n'a qu'un effet — le reçu la saute", async () => {
    await publish("double");
    await ctx.drain();
    // Un relais qui meurt entre l'effet et la suite : la ligne est réservée de
    // nouveau, bail expiré. La garde trouve le reçu et n'appelle pas l'abonné.
    await ctx.prisma.outboxDelivery.updateMany({ data: { claimedUntil: daysAgo(1) } });
    await sweep();

    expect(probe.received).toHaveLength(1);
  });

  it("deux relais concurrents ne livrent pas deux fois", async () => {
    probe.failuresLeft = 30;
    for (let index = 0; index < 30; index += 1) {
      await publish(`course-${index}`);
    }
    await ctx.drain();
    probe.failuresLeft = 0;
    await makeRetriesDue();

    const relay = ctx.app.get(OutboxRelay);
    await Promise.all([relay.sweep(), relay.sweep(), sweep()]);

    expect(probe.received).toHaveLength(30);
    expect(new Set(probe.received).size).toBe(30);
  });

  it("une lettre morte ne repart que par le rejeu manuel", async () => {
    probe.failuresLeft = 1;
    await publish("morte");
    await ctx.drain();
    await ctx.prisma.outboxDelivery.updateMany({
      data: { attempts: 10, nextAttemptAt: daysAgo(1) },
    });
    await sweep();
    expect(probe.received).toEqual([]);

    const { eventId } = await ctx.prisma.outboxDelivery.findFirstOrThrow();
    const relay = ctx.app.get(OutboxRelay);
    await relay.sweep();
    expect(probe.received).toEqual([]);

    await ctx.app
      .get(CommandBus)
      .execute(new ReplayOutboxDeliveryCommand(eventId, PROBE_SUBSCRIBER));
    await ctx.drain();
    expect(probe.received).toEqual([eventId]);
  });

  /**
   * L'écran des messages morts (2026-10-10, plan §8) : un message mort qu'on
   * ne voit pas est une divergence muette entre deux blocs.
   */
  it("liste les messages morts — et eux seuls — en nommant l'abonné qui bloque", async () => {
    probe.failuresLeft = 1;
    await publish("morte");
    await publish("vivante");
    await ctx.drain();
    const dead = await ctx.prisma.outboxDelivery.findFirstOrThrow({
      where: { deliveredAt: null },
      include: { message: true },
    });
    await ctx.prisma.outboxDelivery.update({
      where: { eventId_subscriber: { eventId: dead.eventId, subscriber: dead.subscriber } },
      data: { attempts: 10 },
    });

    const view = jsonBody<DeadLettersView>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/outbox/dead-letters").expect(200),
    );

    expect(view).toEqual({
      letters: [
        {
          eventId: dead.eventId,
          subscriber: PROBE_SUBSCRIBER,
          type: dead.message.type,
          key: dead.message.key,
          occurredAt: dead.message.occurredAt.toISOString(),
          attempts: 10,
          lastError: "sonde en panne",
        },
      ],
      truncated: false,
    });
  });

  it("ne compte pas comme mort un abonné qui a encore des essais", async () => {
    probe.failuresLeft = 1;
    await publish("en-reprise");
    await ctx.drain();

    const view = jsonBody<DeadLettersView>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/outbox/dead-letters").expect(200),
    );

    expect(view.letters).toEqual([]);
  });

  it("le balayage et le rejeu refusent l'anonyme", async () => {
    await ctx.http().post("/admin/outbox/sweep").expect(401);
    await ctx
      .http()
      .post("/admin/outbox/replay")
      .send({ eventId: "x", subscriber: PROBE_SUBSCRIBER })
      .expect(401);
    await ctx.http().get("/admin/outbox/dead-letters").expect(401);
  });
});
