/**
 * E2E de **la fiche Chorus Pro** d'un organisme public
 * (`PUT /admin/companies/:companyId/chorus-routing`, plan des clients publics,
 * § 6 bis).
 *
 * Ce que seul le vrai serveur prouve : la ligne rangée avec la parole de
 * l'agent, le refus sur une forme non publique, le refus du changement de
 * nature d'un compte actif par la vraie route d'identité, la garde
 * `b2b_companies` en écriture résolue en base, et la fiche servie au staff —
 * avec la pièce `chorus` qui remplace le KBIS dans le verdict d'activation.
 */
import type { StaffResource } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, E2E_STAFF_ID, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

/** Le jeton porteur EST le `sub` : chaque agent a sa fiche. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
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

const route = (companyId: string): string => `/admin/companies/${companyId}/chorus-routing`;

/** Le relevé tel que l'écran l'envoie. Le jour n'est comparé à aucune horloge. */
const READING = {
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "SERVICE-A",
  checkedOn: "2026-11-01",
};

/** Une société en attente, passée organisme public par la route d'identité. */
async function publicCompany(): Promise<string> {
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch(`/admin/companies/${company.id}/identity`)
    .send({ formeJuridique: "public_state" })
    .expect(204);
  return company.id;
}

/** Un membre du staff aux seuls droits listés, par-dessus son rôle. */
async function staffWith(
  sub: string,
  grants: readonly {
    resource: StaffResource;
    action: "read" | "write";
    effect: "allow" | "deny";
  }[],
): Promise<void> {
  const member = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      role: "commercial",
      status: "active",
      auth0Id: sub,
    },
  });
  for (const grant of grants) {
    await ctx.prisma.staffPermissionOverride.create({ data: { staffUserId: member.id, ...grant } });
  }
}

describe("la fiche Chorus Pro d'un organisme public", () => {
  it("se range avec la parole de l'agent, et la fiche staff la sert", async () => {
    const companyId = await publicCompany();

    await ctx.asSub(E2E_STAFF_SUB).put(route(companyId)).send(READING).expect(204);

    const row = await ctx.prisma.companyChorusRouting.findUniqueOrThrow({ where: { companyId } });
    expect(row).toMatchObject({
      commitmentRequired: true,
      serviceCodeRequired: true,
      defaultServiceCode: "SERVICE-A",
      checkedByStaffId: E2E_STAFF_ID,
    });
    expect(row.checkedOn.toISOString().slice(0, 10)).toBe(READING.checkedOn);

    const fiche = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${companyId}`).expect(200);
    expect(fiche.body).toMatchObject({
      chorusRouting: {
        commitmentRequired: true,
        serviceCodeRequired: true,
        defaultServiceCode: "SERVICE-A",
        checkedOn: READING.checkedOn,
      },
    });
    expect((fiche.body as { piecesReached: string[] }).piecesReached).toContain("chorus");
    const pieces = (fiche.body as { gate: { checklist: { piece: string; done: boolean }[] } }).gate
      .checklist;
    expect(pieces).toContainEqual({ piece: "chorus", blocking: true, done: true });
    expect(pieces.map((check) => check.piece)).not.toContain("kbis");
  });

  it("se réécrit en entier quand le relevé change", async () => {
    const companyId = await publicCompany();
    await ctx.asSub(E2E_STAFF_SUB).put(route(companyId)).send(READING).expect(204);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(companyId))
      .send({ ...READING, serviceCodeRequired: false, defaultServiceCode: "" })
      .expect(204);

    const row = await ctx.prisma.companyChorusRouting.findUniqueOrThrow({ where: { companyId } });
    expect(row).toMatchObject({ serviceCodeRequired: false, defaultServiceCode: "" });
  });

  it("bloque l'activation d'un organisme public tant qu'elle n'est pas relevée", async () => {
    const companyId = await publicCompany();

    const fiche = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/companies/${companyId}`).expect(200);

    expect((fiche.body as { chorusRouting: unknown }).chorusRouting).toBeNull();
    expect((fiche.body as { gate: { blocking: string[] } }).gate.blocking).toContain("chorus");
  });

  it("est refusée sur une entreprise (409), sans rien écrire", async () => {
    const company = await createCompany(ctx.prisma);

    const refused = await ctx.asSub(E2E_STAFF_SUB).put(route(company.id)).send(READING).expect(409);

    expect(refused.body).toMatchObject({ code: "account.company.chorus_routing_not_public" });
    expect(await ctx.prisma.companyChorusRouting.count()).toBe(0);
  });

  it("refuse une date du relevé impossible (400)", async () => {
    const companyId = await publicCompany();

    await ctx
      .asSub(E2E_STAFF_SUB)
      .put(route(companyId))
      .send({ ...READING, checkedOn: "2026-02-30" })
      .expect(400);
  });

  it("rend 404 sur une société inconnue", async () => {
    await ctx.asSub(E2E_STAFF_SUB).put(route("societe-absente")).send(READING).expect(404);
  });

  it("refuse sans b2b_companies:write (403), sans rien écrire", async () => {
    const companyId = await publicCompany();
    await staffWith("staff-lecture", [
      { resource: "b2b_companies", action: "read", effect: "allow" },
      { resource: "b2b_companies", action: "write", effect: "deny" },
    ]);

    await ctx.asSub("staff-lecture").put(route(companyId)).send(READING).expect(403);

    expect(await ctx.prisma.companyChorusRouting.count()).toBe(0);
  });
});

describe("la nature publique se fige à l'activation", () => {
  it("refuse qu'un compte actif passe d'entreprise à organisme public (409)", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/companies/${company.id}/identity`)
      .send({ formeJuridique: "public_local_authority" })
      .expect(409);

    expect(refused.body).toMatchObject({ code: "account.company.public_nature_frozen" });
    const row = await ctx.prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(row.formeJuridique).toBe("SAS");
  });
});
