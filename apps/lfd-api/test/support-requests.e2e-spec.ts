/**
 * E2E des **demandes de contact** — vrai Postgres.
 *
 * Ce que ces tests verrouillent, et qui était cassé : `handled_at` n'était écrit
 * nulle part. Conséquences enchaînées — la file ne se purgeait jamais, et le
 * client restait **définitivement** verrouillé par `OpenSupportRequestExistsError`,
 * puisque aucune demande ne se fermait. On prouve ici que le cycle boucle.
 */
import type { ActivationSupportPayload, SupportRequestView } from "@lfd/contracts";
import { CustomerRole } from "../src/platform/database/client/client.js";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const STRANGER = "auth0|stranger";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

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

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Une demande de rappel « au plus vite », le chemin non daté. */
const CALL_BACK: ActivationSupportPayload = {
  companyId: null,
  channel: "phone",
  purpose: "discover",
  phoneNumber: "0600000000",
  asap: true,
  scheduledDate: null,
  slot: null,
  message: "Besoin d'aide sur le KBIS",
};

/** Sème une société, son membre et un étranger. */
async function seed(): Promise<string> {
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma, { status: "pending" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  return company.id;
}

/** Dépose une demande côté client, et rend son identifiant côté staff. */
async function request(companyId: string): Promise<string> {
  await ctx
    .asSub(MEMBER)
    .post("/support/activation")
    .send({ ...CALL_BACK, companyId })
    .expect(201);
  const list = await staff().get("/admin/support-requests").expect(200);
  const first = jsonBody<SupportRequestView[]>(list)[0];
  if (first === undefined) {
    throw new Error("la demande déposée n'apparaît pas dans la file staff");
  }
  return first.id;
}

describe("la file staff", () => {
  it("mure la route (401 sans jeton staff)", async () => {
    await ctx.http().get("/admin/support-requests").expect(401);
  });

  it("expose ce que le client a rempli, et pas seulement un booléen", async () => {
    const companyId = await seed();
    await request(companyId);
    const list = await staff().get("/admin/support-requests").expect(200);
    expect(jsonBody<SupportRequestView[]>(list)[0]).toMatchObject({
      companyId,
      channel: "phone",
      purpose: "discover",
      phoneNumber: "0600000000",
      asap: true,
      message: "Besoin d'aide sur le KBIS",
      handledAt: null,
    });
  });

  it("ne rend que les demandes ouvertes, sauf si on demande l'historique", async () => {
    const companyId = await seed();
    const id = await request(companyId);
    await staff().post(`/admin/support-requests/${id}/handle`).expect(204);

    const open = await staff().get("/admin/support-requests").expect(200);
    expect(jsonBody<SupportRequestView[]>(open)).toEqual([]);

    const all = await staff().get("/admin/support-requests?all=true").expect(200);
    expect(jsonBody<SupportRequestView[]>(all)).toHaveLength(1);
  });
});

describe("sans entreprise", () => {
  it("accepte une demande de rappel d'un prospect qui n'a rien déclaré", async () => {
    // La population qu'on cherche à capter : elle ne doit pas buter sur un mur.
    await createUser(ctx.prisma, { auth0Sub: STRANGER });
    await ctx
      .asSub(STRANGER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId: null })
      .expect(201);

    const list = await staff().get("/admin/support-requests").expect(200);
    expect(jsonBody<SupportRequestView[]>(list)[0]).toMatchObject({
      companyId: null,
      channel: "phone",
    });
  });

  it("borne alors la file par PERSONNE, pas par société", async () => {
    await createUser(ctx.prisma, { auth0Sub: STRANGER });
    const payload = { ...CALL_BACK, companyId: null };
    await ctx.asSub(STRANGER).post("/support/activation").send(payload).expect(201);
    // Sans ce garde, un prospect déposerait autant de rappels qu'il a de clics.
    await ctx.asSub(STRANGER).post("/support/activation").send(payload).expect(409);
  });

  it("ne verrouille PAS deux personnes l'une par l'autre", async () => {
    await createUser(ctx.prisma, { auth0Sub: STRANGER });
    const other = "auth0|other";
    await createUser(ctx.prisma, { auth0Sub: other });
    const payload = { ...CALL_BACK, companyId: null };
    await ctx.asSub(STRANGER).post("/support/activation").send(payload).expect(201);
    await ctx.asSub(other).post("/support/activation").send(payload).expect(201);
  });

  it("refuse une société dont on n'est pas membre (le mur tient toujours)", async () => {
    const companyId = await seed();
    await ctx
      .asSub(STRANGER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId })
      .expect(404);
  });
});

describe("le motif", () => {
  it("accompagne la demande jusqu'à la file staff — l'objet de l'échange", async () => {
    const companyId = await seed();
    await ctx
      .asSub(MEMBER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId, purpose: "billing" })
      .expect(201);
    const response = await staff().get("/admin/support-requests").expect(200);
    expect(jsonBody<SupportRequestView[]>(response)[0]?.purpose).toBe("billing");
  });

  it("refuse « autre demande » sans un mot d'explication (400)", async () => {
    const companyId = await seed();
    await ctx
      .asSub(MEMBER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId, purpose: "other", message: "" })
      .expect(400);
  });
});

describe("la clôture", () => {
  it("écrit handled_at — ce que rien ne faisait", async () => {
    const companyId = await seed();
    const id = await request(companyId);
    await staff().post(`/admin/support-requests/${id}/handle`).expect(204);

    const row = await ctx.prisma.supportRequest.findUnique({
      where: { id },
      select: { handledAt: true },
    });
    expect(row?.handledAt).not.toBeNull();
  });

  it("DÉVERROUILLE le client : il peut redéposer une demande", async () => {
    const companyId = await seed();
    const id = await request(companyId);

    // Tant que la première est ouverte, la seconde est refusée (409).
    await ctx
      .asSub(MEMBER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId })
      .expect(409);

    await staff().post(`/admin/support-requests/${id}/handle`).expect(204);

    // Une fois traitée, le client redevient libre de redemander.
    await ctx
      .asSub(MEMBER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId })
      .expect(201);
    expect(await ctx.prisma.supportRequest.count()).toBe(2);
  });

  it("est idempotente : re-traiter ne réécrit pas la date", async () => {
    const companyId = await seed();
    const id = await request(companyId);
    await staff().post(`/admin/support-requests/${id}/handle`).expect(204);
    const first = await ctx.prisma.supportRequest.findUnique({
      where: { id },
      select: { handledAt: true },
    });

    await staff().post(`/admin/support-requests/${id}/handle`).expect(204);
    const second = await ctx.prisma.supportRequest.findUnique({
      where: { id },
      select: { handledAt: true },
    });
    expect(second?.handledAt?.toISOString()).toBe(first?.handledAt?.toISOString());
  });

  it("rend 404 sur une demande inconnue", async () => {
    await staff().post("/admin/support-requests/inconnue/handle").expect(404);
  });
});

describe("le mur client", () => {
  it("refuse une demande sur une société dont on n'est pas membre", async () => {
    const companyId = await seed();
    await ctx
      .asSub(STRANGER)
      .post("/support/activation")
      .send({ ...CALL_BACK, companyId })
      .expect(404);
    expect(await ctx.prisma.supportRequest.count()).toBe(0);
  });
});
