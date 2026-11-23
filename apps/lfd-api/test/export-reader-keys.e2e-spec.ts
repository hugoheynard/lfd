/**
 * E2E **les clés de l'export des ventes** (lot E2,
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.1, § 6.5).
 *
 * Ce que seul le vrai SQL prouve :
 * - la création rend le secret une fois ; la liste ne le rend jamais, ni son
 *   haché, et la base ne garde que le haché ;
 * - un rejeu de la même clé d'intention ne crée pas de seconde clé ;
 * - la révocation se range, se journalise, et la garde la voit à l'appel suivant ;
 * - le geste est muré par `exports` ;
 * - les `CHECK` de la table.
 *
 * Doublée : la signature du jeton staff.
 */
import type { ExportReaderKeyView, IssuedExportReaderKeyResponse } from "@lfd/contracts";

import { ExportReaderAdmission } from "../src/lafoliecoffee/reporting/application/services/export-reader-admission.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const ROUTE = "/admin/export-keys";
const ADMITTED_IP = "203.0.113.7";
const READER_ROLE = {
  key: "lecteur-ventes",
  label: "Lecteur des ventes",
  grants: [{ resource: "b2b_orders", action: "write" }],
} as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function admin() {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Une échéance dans un an : la clé naît vivante, quel que soit le jour du test. */
function inAYear(): string {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString();
}

async function issue(intent = freshIntent(), expiresAt = inAYear()) {
  const response = await admin()
    .post(ROUTE)
    .set(INTENT_KEY, intent)
    .send({ label: "Direction", expiresAt, allowedIps: [ADMITTED_IP] })
    .expect(201);
  return jsonBody<IssuedExportReaderKeyResponse>(response);
}

function admit(secret: string, ip: string): Promise<string | null> {
  return ctx.app.get(ExportReaderAdmission).admit(secret, ip);
}

describe("créer une clé", () => {
  it("rend le secret une fois ; la liste ne le rend jamais, la base n'en garde que le haché", async () => {
    const issued = await issue();

    expect(issued.secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const listed = jsonBody<ExportReaderKeyView[]>(await admin().get(ROUTE).expect(200));
    expect(listed).toEqual([
      expect.objectContaining({
        id: issued.id,
        label: "Direction",
        revokedAt: null,
        allowedIps: [ADMITTED_IP],
      }),
    ]);
    const served = JSON.stringify(listed);
    expect(served).not.toContain(issued.secret);
    expect(served).not.toMatch(/secret|hash/iu);
    const row = await ctx.prisma.exportReaderKey.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.secretHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.secretHash).not.toBe(issued.secret);

    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "export_key.created" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ subjectLabel: "Direction", allowedIpCount: 1 });
  });

  it("rejouée sous la même clé d'intention, refuse (409) sans créer de seconde clé ni rendre le secret", async () => {
    const intent = freshIntent();
    const expiresAt = inAYear();
    const first = await issue(intent, expiresAt);
    const replayed = await admin()
      .post(ROUTE)
      .set(INTENT_KEY, intent)
      .send({ label: "Direction", expiresAt, allowedIps: [ADMITTED_IP] })
      .expect(409);

    expect(JSON.stringify(replayed.body)).not.toContain(first.secret);
    await expect(ctx.prisma.exportReaderKey.count()).resolves.toBe(1);
    // La même clé d'intention sur une AUTRE demande n'est pas un rejeu : 409.
    await admin()
      .post(ROUTE)
      .set(INTENT_KEY, intent)
      .send({ label: "Autre lecteur", expiresAt, allowedIps: [] })
      .expect(409);
  });

  it("refuse une échéance passée (400) et une adresse illisible (400), sans rien écrire", async () => {
    await admin()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ label: "Direction", expiresAt: "2020-01-01T00:00:00.000Z", allowedIps: [] })
      .expect(400);
    await admin()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ label: "Direction", expiresAt: inAYear(), allowedIps: ["pas une ip"] })
      .expect(400);

    await expect(ctx.prisma.exportReaderKey.count()).resolves.toBe(0);
  });
});

describe("la garde lit la vraie base", () => {
  it("admet la clé depuis l'adresse admise, la refuse ailleurs, puis plus du tout une fois révoquée", async () => {
    const issued = await issue();
    const secret = issued.secret;

    await expect(admit(secret, ADMITTED_IP)).resolves.toBe(issued.id);
    await expect(admit(secret, "198.51.100.4")).resolves.toBeNull();

    await admin().post(`${ROUTE}/${issued.id}/revoke`).set(INTENT_KEY, freshIntent()).expect(204);

    await expect(admit(secret, ADMITTED_IP)).resolves.toBeNull();
  });
});

describe("révoquer une clé", () => {
  it("range la révocation et son auteur, journalise, et refuse une seconde révocation (409)", async () => {
    const issued = await issue();
    const intent = freshIntent();

    await admin().post(`${ROUTE}/${issued.id}/revoke`).set(INTENT_KEY, intent).expect(204);
    await admin().post(`${ROUTE}/${issued.id}/revoke`).set(INTENT_KEY, intent).expect(204);
    await admin().post(`${ROUTE}/${issued.id}/revoke`).set(INTENT_KEY, freshIntent()).expect(409);

    const row = await ctx.prisma.exportReaderKey.findUniqueOrThrow({ where: { id: issued.id } });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedByStaffId).not.toBeNull();
    await ctx.drain();
    await expect(
      ctx.prisma.activityEvent.count({ where: { type: "export_key.revoked" } }),
    ).resolves.toBe(1);
  });

  it("refuse une clé inconnue (404)", async () => {
    await admin().post(`${ROUTE}/absente/revoke`).set(INTENT_KEY, freshIntent()).expect(404);
  });
});

describe("le mur : la ressource exports", () => {
  it("refuse un membre sans le droit exports (403), en lecture comme en écriture", async () => {
    await admin().post("/admin/staff-roles").send(READER_ROLE).expect(201);
    const reader = await staffWithRole(ctx, "lecteur", READER_ROLE.key);

    await reader.agent.get(ROUTE).expect(403);
    await reader.agent
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({ label: "Direction", expiresAt: inAYear(), allowedIps: [] })
      .expect(403);
    await expect(ctx.prisma.exportReaderKey.count()).resolves.toBe(0);
  });
});

describe("la base", () => {
  it("refuse une révocation sans auteur et un haché qui n'en est pas un", async () => {
    const issued = await issue();

    await expect(
      ctx.prisma.exportReaderKey.update({
        where: { id: issued.id },
        data: { revokedAt: new Date() },
      }),
    ).rejects.toThrow(/export_reader_key_revocation_complete/u);
    await expect(
      ctx.prisma.exportReaderKey.update({
        where: { id: issued.id },
        data: { secretHash: issued.secret },
      }),
    ).rejects.toThrow(/export_reader_key_secret_hash_sha256/u);
  });
});
