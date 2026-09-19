/**
 * E2E : **la cloche et l'abonnement push écrivent l'id de fiche** —
 * `documentation/journalisation/architecture-journalisation.md` §12, étape 3 (D2, D9).
 *
 * Deux écritures qui passaient le `sub` à la main (`@StaffSub()`, retiré le
 * 2026-09-18) : `StaffNotification.readBy` et l'auteur d'un abonnement push. La colonne de
 * ce dernier s'appelait `staff_sub` jusqu'à l'étape 5 du plan, qui l'a
 * renommée `staff_user_id`.
 *
 * Doublée, et elle seule : la signature du jeton (le jeton EST le `sub`).
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import type { StaffPrincipal } from "../src/platform/auth/staff-principal.js";
import { StaffNoticeStore } from "../src/staff/notifications/domain/ports/staff-notifier.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<StaffPrincipal> =>
    Promise.resolve({ subject: token, scopes: [], email: undefined, emailVerified: undefined }),
};

const ENDPOINT = "https://push.example.test/abonnement-poste-comptoir";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function ringOnce(key: string): Promise<void> {
  await ctx.app.get(StaffNoticeStore).save([
    {
      kind: "alert.account",
      subject: "Compte à regarder",
      body: "Une ligne.",
      link: "/comptes-clients",
      idempotencyKey: key,
      occurredAt: new Date(daysAgo(1)),
    },
  ]);
}

describe("la cloche — qui a lu", () => {
  it("écrit l'id de fiche du lecteur, jamais son sub", async () => {
    await ringOnce("cloche-une");
    const notice = await ctx.prisma.staffNotification.findUniqueOrThrow({
      where: { idempotencyKey: "cloche-une" },
    });

    await operator().post(`/admin/notifications/${notice.id}/read`).expect(204);

    const read = await ctx.prisma.staffNotification.findUniqueOrThrow({
      where: { id: notice.id },
    });
    expect(read.readBy).toBe(E2E_STAFF_ID);
  });

  it("écrit l'id de fiche quand on marque tout lu", async () => {
    await ringOnce("cloche-a");
    await ringOnce("cloche-b");

    await operator().post("/admin/notifications/read").expect(204);

    const readers = await ctx.prisma.staffNotification.findMany({ select: { readBy: true } });
    expect(readers).toEqual([{ readBy: E2E_STAFF_ID }, { readBy: E2E_STAFF_ID }]);
  });
});

describe("l'abonnement push — une trace de qui a abonné", () => {
  it("écrit l'id de fiche dans staff_user_id", async () => {
    await operator()
      .post("/admin/notifications/push")
      .send({ endpoint: ENDPOINT, keys: { p256dh: "cle-publique", auth: "secret" } })
      .expect(204);

    const subscription = await ctx.prisma.staffPushSubscription.findUniqueOrThrow({
      where: { endpoint: ENDPOINT },
    });
    expect(subscription.staffUserId).toBe(E2E_STAFF_ID);
  });
});
