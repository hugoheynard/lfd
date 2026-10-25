/**
 * E2E de la surface **prospects** (`GET /admin/prospects`) — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : la file lit l'agrégat `Lead` (`growth.leads`)
 * tel que la saisie l'écrit, n'en garde que les étapes ouvertes, et ne montre
 * plus aucun particulier venu du journal (lot P3 du plan
 * `documentation/b2b/plan-auto-acquisition-pro.md`, 2026-10-25). La route est
 * **murée staff**. Les leads sont saisis par la vraie route, pas par Prisma.
 */
import type { CreatedLeadResponse, ProspectView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let sequence = 0;

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
  sequence = 0;
});

/** L'agent authentifié comme staff. */
function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Saisit un établissement démarché par la route du commercial. */
async function capture(payload: Record<string, string>): Promise<string> {
  const created = jsonBody<CreatedLeadResponse>(
    await staff().post("/admin/leads").send(payload).expect(201),
  );
  return created.id;
}

/** Insère une ligne de journal sur une personne — ce que la file lisait avant P3. */
async function seedPerson(
  type: string,
  subjectId: string,
  occurredAt: string,
  payload: InputJsonObject,
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType: "user",
      subjectId,
      actorType: "customer",
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${subjectId}:${sequence}`,
      payload,
    },
  });
}

describe("GET /admin/prospects", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/prospects").expect(401);
  });

  it("rend un établissement démarché avec ses colonnes : contact, coordonnées, étape, depuis", async () => {
    const id = await capture({
      businessName: "Bistrot du Coin",
      contactName: "Paul Martin",
      email: "paul@bistrot.fr",
      phone: "06 12 34 56 78",
    });

    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));

    expect(prospects).toHaveLength(1);
    expect(prospects[0]).toMatchObject({
      leadId: id,
      businessName: "Bistrot du Coin",
      contactName: "Paul Martin",
      email: "paul@bistrot.fr",
      phone: "06 12 34 56 78",
      status: "new",
      lastContactedAt: null,
    });
    expect(Number.isNaN(Date.parse(prospects[0]?.capturedAt ?? ""))).toBe(false);
  });

  it("suit l'étape posée depuis la ligne, et sort le lead clos (converti, perdu)", async () => {
    const open = await capture({ businessName: "En cours" });
    const won = await capture({ businessName: "Converti" });
    const lost = await capture({ businessName: "Perdu" });
    await staff().patch(`/admin/leads/${open}`).send({ status: "qualified" }).expect(204);
    await staff().patch(`/admin/leads/${won}`).send({ status: "converted" }).expect(204);
    await staff().patch(`/admin/leads/${lost}`).send({ status: "lost" }).expect(204);

    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));

    expect(prospects.map((p) => p.leadId)).toEqual([open]);
    expect(prospects[0]?.status).toBe("qualified");
    expect(prospects[0]?.lastContactedAt).not.toBeNull();
  });

  /**
   * Régression (lot P3, 2026-10-25) : la file dérivait du journal des
   * personnes — `hot` (commande sans société) et `mid` (inscrit sans
   * commande). Depuis la boutique, c'étaient des clients particuliers.
   */
  it("ne montre aucun particulier, inscrit ou client sans société", async () => {
    await seedPerson("user.registered", "u_mid", daysAgo(2), {});
    await seedPerson("order.placed", "u_hot", daysAgo(5), { totalCents: 633, companyId: null });

    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));

    expect(prospects).toEqual([]);
  });
});
