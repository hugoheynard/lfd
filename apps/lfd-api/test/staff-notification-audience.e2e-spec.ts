/**
 * E2E **les notifications adressées par droit** (`documentation/livraisons/plan-a-la-porte.md`,
 * B5, LB-Q3 ; mécanique de `plan-tournee-prete.md`, PL5-D1/D2).
 *
 * Le fait réel : un signalement « personne » prévient les commerciaux
 * (`b2b_companies:write`), APRÈS la validation. Ce que seule cette suite
 * prouve, sur la vraie base et le vrai guard :
 * - la commerciale la voit dans « mes notifications » ; le livreur et la
 *   comptable, non ;
 * - le fil PARTAGÉ l'exclut — liste, compteur, et marquage par son id ;
 * - la poussée ne part qu'aux téléphones de qui tient le droit, et une
 *   notice partagée ne part plus au livreur.
 *
 * Doublées : la signature du jeton, et l'ENVOI Web Push (un tiers distant) —
 * remplacé par un enregistreur qui dit à quels appareils on a écrit.
 */
import type { StaffNotificationsSummary } from "@lfd/contracts";
import type request from "supertest";

import {
  type StaffNotice,
  StaffNotifier,
} from "../src/staff/notifications/domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  type PushOutcome,
  type StaffPushTarget,
} from "../src/staff/notifications/domain/ports/staff-push.js";
import { MY_ROUND, staffWithRole } from "./delivery-driver-scene.js";
import { departedStop, DOOR_ROLE } from "./delivery-handover-scene.js";
import { ADMIN_VERIFIER_OVERRIDE, forgetCustomer } from "./delivery-rounds-scene.js";
import { forgetRoutingScene } from "./delivery-routing-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

/** L'envoi Web Push, enregistré : chaque notice, et les appareils visés. */
class RecordingPushSender extends StaffPushSender {
  readonly sent: { readonly kind: string; readonly endpoints: readonly string[] }[] = [];

  publicKey(): string | null {
    return "cle-publique-e2e";
  }

  send(targets: readonly StaffPushTarget[], notice: StaffNotice): Promise<PushOutcome> {
    this.sent.push({ kind: notice.kind, endpoints: targets.map((target) => target.endpoint) });
    return Promise.resolve({ gone: [], rejected: [] });
  }
}

const sender = new RecordingPushSender();
const MINE = "/admin/me/notifications";
const SHARED = "/admin/notifications";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: StaffPushSender, value: sender }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
  sender.sent.splice(0);
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(DOOR_ROLE).expect(201);
});

const endpointOf = (who: string): string => `https://push.example.test/${who}`;

async function subscribe(agent: request.Agent, who: string): Promise<void> {
  await agent
    .post(`${MINE}/push`)
    .send({ endpoint: endpointOf(who), keys: { p256dh: "p256", auth: "auth" } })
    .expect(204);
}

async function summary(agent: request.Agent, path: string): Promise<StaffNotificationsSummary> {
  return jsonBody<StaffNotificationsSummary>(await agent.get(path).expect(200));
}

/** Le livreur, la commerciale, la comptable ; chacun a abonné son téléphone ; « personne » signalé. */
async function decisionRung() {
  const paul = await staffWithRole(ctx, "livreur-paul");
  const lea = await staffWithRole(ctx, "commerciale-lea", "commercial");
  const ines = await staffWithRole(ctx, "compta-ines", "comptabilite");
  for (const [agent, who] of [
    [paul.agent, "paul"],
    [lea.agent, "lea"],
    [ines.agent, "ines"],
  ] as const) {
    await subscribe(agent, who);
  }
  const { roundId, stopId } = await departedStop(ctx, paul);
  await paul.agent
    .post(`${MY_ROUND}/${roundId}/incidents`)
    .field("family", "doorstep")
    .field("reason", "nobody_present")
    .field("note", "")
    .field("stopId", stopId)
    .expect(201);
  await ctx.drain();
  return { paul, lea, ines };
}

describe("« Arrêt à décider » — adressée aux commerciaux (B5)", () => {
  it("🔴 la commerciale la voit ; le livreur et la comptable ne la voient pas", async () => {
    const { paul, lea, ines } = await decisionRung();

    const mine = await summary(lea.agent, MINE);
    expect(mine.unread).toBe(1);
    expect(mine.notifications).toEqual([
      expect.objectContaining({ kind: "delivery.stop_decision", link: "/livraison/a-decider" }),
    ]);
    expect(await summary(paul.agent, MINE)).toEqual({ unread: 0, notifications: [] });
    expect(await summary(ines.agent, MINE)).toEqual({ unread: 0, notifications: [] });
    // Une par signalement : la ligne porte son audience.
    const rows = await ctx.prisma.staffNotification.findMany({
      select: { audience: true, idempotencyKey: true },
    });
    expect(rows.map((row) => row.audience)).toEqual(["b2b_companies:write"]);
    expect(rows[0]?.idempotencyKey).toMatch(/^delivery\.stop_decision:/u);
  });

  it("🔴 le fil PARTAGÉ l'exclut : liste, compteur, et marquage par son id", async () => {
    const { lea } = await decisionRung();
    const admin = ctx.asSub(E2E_STAFF_SUB);
    const notice = await ctx.prisma.staffNotification.findFirstOrThrow({ select: { id: true } });

    expect(await summary(admin, SHARED)).toEqual({ unread: 0, notifications: [] });
    await admin.post(`${SHARED}/${notice.id}/read`).expect(204);
    await admin.post(`${SHARED}/read`).expect(204);
    expect(
      await ctx.prisma.staffNotification.findUniqueOrThrow({ where: { id: notice.id } }),
    ).toMatchObject({ readAt: null, readBy: null });

    await lea.agent.post(`${MINE}/${notice.id}/read`).expect(204);
    expect((await summary(lea.agent, MINE)).unread).toBe(0);
  });

  it("🔴 un livreur ne marque pas lue, par son id, la notice des commerciaux", async () => {
    const { paul } = await decisionRung();
    const notice = await ctx.prisma.staffNotification.findFirstOrThrow({ select: { id: true } });

    await paul.agent.post(`${MINE}/${notice.id}/read`).expect(204);
    await paul.agent.post(`${MINE}/read`).expect(204);

    expect(
      await ctx.prisma.staffNotification.findUniqueOrThrow({ where: { id: notice.id } }),
    ).toMatchObject({ readAt: null });
  });

  it("🔴 la poussée ne part qu'au téléphone de la commerciale (et de l'admin s'il en avait un)", async () => {
    await decisionRung();

    expect(sender.sent).toEqual([
      { kind: "delivery.stop_decision", endpoints: [endpointOf("lea")] },
    ]);
  });

  it("🔴 une notice PARTAGÉE ne part plus au téléphone du livreur", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");
    const ines = await staffWithRole(ctx, "compta-ines", "comptabilite");
    await subscribe(paul.agent, "paul");
    await subscribe(ines.agent, "ines");

    // Le notificateur complet, comme un émetteur réel : il écrit, puis pousse.
    await ctx.app.get(StaffNotifier).notify([
      {
        kind: "alert.account",
        subject: "Compte à regarder",
        body: "Une ligne.",
        link: "/comptes-clients",
        idempotencyKey: "alerte-partagee",
        occurredAt: new Date(daysAgo(1)),
      },
    ]);
    await ctx.drain();

    expect(sender.sent).toEqual([{ kind: "alert.account", endpoints: [endpointOf("ines")] }]);
    expect(await summary(paul.agent, MINE)).toEqual({ unread: 0, notifications: [] });
    await paul.agent.get(SHARED).expect(403);
  });

  it("s'abonner « à moi » ne demande que l'authentification — le livreur le peut", async () => {
    const paul = await staffWithRole(ctx, "livreur-paul");

    await subscribe(paul.agent, "paul");
    await paul.agent.get(`${MINE}/push/key`).expect(200);
    await paul.agent
      .post("/admin/notifications/push")
      .send({
        endpoint: endpointOf("paul-2"),
        keys: { p256dh: "p", auth: "a" },
      })
      .expect(403);

    const row = await ctx.prisma.staffPushSubscription.findUniqueOrThrow({
      where: { endpoint: endpointOf("paul") },
    });
    expect(row.staffUserId).toBe(paul.id);
  });
});
