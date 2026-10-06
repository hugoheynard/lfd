/**
 * E2E des **destinataires du dossier du jour** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décisions 3-4, lot E2).
 *
 * Tout passe par les vraies routes, la vraie base et ses contraintes. Les
 * fiches du personnel sont lues dans l'annuaire par son port ; les droits se
 * posent comme à l'écran, par un rôle qui ne tient que ce qu'on éprouve.
 */
import type {
  CreatedIdResponse,
  DossierRecipientView,
  DossierStaffCandidateView,
  RoleGrant,
} from "@lfd/contracts";
import type request from "supertest";

import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const ROUTE = "/admin/production/settings/dossier-recipients";

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

const admin = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

async function list(agent: request.Agent = admin()): Promise<DossierRecipientView[]> {
  return jsonBody<DossierRecipientView[]>(await agent.get(ROUTE).expect(200));
}

/** Une fiche de l'annuaire, sans accès. */
async function fiche(
  key: string,
  status: "active" | "suspended" = "active",
): Promise<{ readonly id: string; readonly email: string }> {
  const email = `${key}@lfc.test`;
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Paul",
      lastName: key,
      email,
      jobTitle: "Chef",
      role: "admin",
      status,
    },
  });
  return { id: row.id, email };
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
  await admin().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function facts(type: string): Promise<number> {
  return ctx.prisma.activityEvent.count({ where: { type } });
}

describe("inscrire des destinataires", () => {
  it("une fiche du personnel, relue dans l'annuaire, puis un externe", async () => {
    const paul = await fiche("chef");

    const staff = jsonBody<CreatedIdResponse>(
      await admin().post(ROUTE).send({ kind: "staff", staffUserId: paul.id }).expect(201),
    );
    const external = jsonBody<CreatedIdResponse>(
      await admin()
        .post(ROUTE)
        .send({
          kind: "external",
          email: " Jeanne@Compta.test ",
          firstName: "Jeanne",
          lastName: "Roux",
          jobTitle: "Comptable",
        })
        .expect(201),
    );

    expect(await list()).toEqual([
      {
        id: staff.id,
        kind: "staff",
        email: paul.email,
        firstName: "Paul",
        lastName: "chef",
        jobTitle: "Chef",
        staffUserId: paul.id,
        inactive: false,
      },
      {
        id: external.id,
        kind: "external",
        email: "jeanne@compta.test",
        firstName: "Jeanne",
        lastName: "Roux",
        jobTitle: "Comptable",
        staffUserId: null,
      },
    ]);
    expect(await facts("production_dossier_recipient.added")).toBe(2);
  });

  it("une fiche dont l'adresse change se relit avec la nouvelle", async () => {
    const paul = await fiche("chef");
    await admin().post(ROUTE).send({ kind: "staff", staffUserId: paul.id }).expect(201);

    await ctx.prisma.staffUser.update({
      where: { id: paul.id },
      data: { email: "nouveau@lfc.test" },
    });

    expect((await list())[0]?.email).toBe("nouveau@lfc.test");
  });

  it("refuse (409) un externe qui porte l'adresse d'une fiche inscrite, et n'écrit rien", async () => {
    const paul = await fiche("chef");
    await admin().post(ROUTE).send({ kind: "staff", staffUserId: paul.id }).expect(201);

    const response = await admin()
      .post(ROUTE)
      .send({ kind: "external", email: paul.email.toUpperCase(), firstName: "P", lastName: "C" })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("Paul chef");
    expect(await list()).toHaveLength(1);
    expect(await facts("production_dossier_recipient.added")).toBe(1);
  });

  it("refuse (409) deux externes à la même adresse", async () => {
    const body = { kind: "external", email: "j@x.test", firstName: "J", lastName: "R" };
    await admin().post(ROUTE).send(body).expect(201);
    await admin().post(ROUTE).send(body).expect(409);
  });

  it("refuse (409) une fiche suspendue, (404) une fiche inconnue", async () => {
    const off = await fiche("parti", "suspended");
    await admin().post(ROUTE).send({ kind: "staff", staffUserId: off.id }).expect(409);
    await admin().post(ROUTE).send({ kind: "staff", staffUserId: "inconnu" }).expect(404);
  });

  it.each([
    ["une adresse mal formée", { email: "jeanne.x.test", firstName: "J", lastName: "R" }],
    ["une adresse vide", { email: " " }],
  ])("refuse (400) %s", async (_case, body) => {
    await admin()
      .post(ROUTE)
      .send({ kind: "external", ...body })
      .expect(400);
  });

  it("inscrit (201) un externe sans prénom ni nom : seule l'adresse est requise", async () => {
    const { id } = jsonBody<CreatedIdResponse>(
      await admin()
        .post(ROUTE)
        .send({ kind: "external", email: "imprimerie@x.test", lastName: " " })
        .expect(201),
    );

    expect(await list()).toEqual([
      {
        id,
        kind: "external",
        email: "imprimerie@x.test",
        firstName: null,
        lastName: null,
        jobTitle: null,
        staffUserId: null,
      },
    ]);
    const added = await ctx.prisma.activityEvent.findFirst({
      where: { type: "production_dossier_recipient.added", subjectId: id },
    });
    expect(added?.payload).toMatchObject({ subjectLabel: "un destinataire externe" });
    expect(JSON.stringify(added?.payload)).not.toContain("imprimerie@x.test");
  });
});

describe("retirer un destinataire", () => {
  it("l'archive, le journalise, et l'adresse peut revenir", async () => {
    const body = { kind: "external", email: "j@x.test", firstName: "J", lastName: "R" };
    const { id } = jsonBody<CreatedIdResponse>(await admin().post(ROUTE).send(body).expect(201));

    await admin().delete(`${ROUTE}/${id}`).expect(204);

    expect(await list()).toEqual([]);
    const row = await ctx.prisma.productionDossierRecipient.findUniqueOrThrow({ where: { id } });
    expect(row.removedAt).not.toBeNull();
    expect(await facts("production_dossier_recipient.removed")).toBe(1);
    await admin().post(ROUTE).send(body).expect(201);
    await admin().delete(`${ROUTE}/${id}`).expect(404);
  });
});

describe("le personnel qu'on peut choisir", () => {
  it("ne propose pas une fiche suspendue", async () => {
    const paul = await fiche("chef");
    const off = await fiche("parti", "suspended");

    const candidates = jsonBody<DossierStaffCandidateView[]>(
      await admin().get(`${ROUTE}/staff-candidates`).expect(200),
    );

    const ids = candidates.map((candidate) => candidate.staffUserId);
    expect(ids).toContain(paul.id);
    expect(ids).not.toContain(off.id);
  });
});

describe("les droits", () => {
  it("sans `production_settings` : 403 en lecture comme en écriture", async () => {
    const baker = await holderOf("plan-sans-reglages", [
      { resource: "production_plan", action: "write" },
    ]);

    await baker.get(ROUTE).expect(403);
    await baker.get(`${ROUTE}/staff-candidates`).expect(403);
    await baker
      .post(ROUTE)
      .send({ kind: "external", email: "j@x.test", firstName: "J", lastName: "R" })
      .expect(403);
  });

  it("`production_settings:read` lit et liste le personnel, n'inscrit ni ne retire", async () => {
    const reader = await holderOf("reglages-lus", [
      { resource: "production_settings", action: "read" },
    ]);

    await reader.get(ROUTE).expect(200);
    await reader.get(`${ROUTE}/staff-candidates`).expect(200);
    await reader
      .post(ROUTE)
      .send({ kind: "external", email: "j@x.test", firstName: "J", lastName: "R" })
      .expect(403);
    await reader.delete(`${ROUTE}/quelconque`).expect(403);
  });
});
