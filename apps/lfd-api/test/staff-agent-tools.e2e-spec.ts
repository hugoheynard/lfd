/**
 * E2E des **outils agent de la gestion des droits**, côté serveur (plan
 * `documentation/droits-et-permissions/plan-outils-agent-droits.md`,
 * corrections après vitruve) :
 *
 * - la **précondition** facultative — `expectedPermissions` sur
 *   `PUT admin/staff-roles/:key`, `expectedUpdatedAt` sur
 *   `PATCH admin/staff-users/:id` — refuse (409) d'écrire sur un état périmé ;
 * - l'en-tête **`x-lfd-agent-tool`** est rangé dans le fait du journal ;
 * - l'**écran**, qui n'envoie ni l'un ni l'autre, écrit comme avant.
 *
 * Doublés : la signature Auth0 et le fournisseur d'identité — deux frontières.
 */
import type { CreatedStaffUserResponse, StaffRoleView, StaffUserView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({
      subject: `auth0|${input.email}`,
      passwordSetupUrl: "https://tenant.invalid/ticket/neuf",
    }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://tenant.invalid/ticket/renvoi"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};

const AGENT_TOOL_HEADER = "x-lfd-agent-tool";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StaffIdentityPort, value: stubIdentity },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

const ATELIER = {
  key: "atelier",
  label: "Atelier",
  grants: [{ resource: "b2b_orders", action: "read" }],
} as const;

async function createAtelier(): Promise<void> {
  await operator().post("/admin/staff-roles").send(ATELIER).expect(201);
}

async function roleOf(key: string): Promise<StaffRoleView> {
  const response = await operator().get("/admin/staff-roles").expect(200);
  const role = jsonBody<readonly StaffRoleView[]>(response).find((entry) => entry.key === key);
  if (role === undefined) {
    throw new TypeError(`rôle ${key} absent`);
  }
  return role;
}

async function personOf(id: string): Promise<StaffUserView> {
  const response = await operator().get("/admin/staff-users").expect(200);
  const person = jsonBody<readonly StaffUserView[]>(response).find((entry) => entry.id === id);
  if (person === undefined) {
    throw new TypeError(`fiche ${id} absente`);
  }
  return person;
}

async function factsAbout(subjectId: string, type: string) {
  await ctx.drain();
  return ctx.prisma.activityEvent.findMany({
    where: { subjectId, type },
    orderBy: { id: "asc" },
    select: { payload: true },
  });
}

/** Le rôle entier, avec `b2b_alerts:read` en plus — ce que `role_grant` renvoie. */
const GRANTED = {
  label: "Atelier",
  grants: [...ATELIER.grants, { resource: "b2b_alerts", action: "read" }],
};

describe("PUT admin/staff-roles/:key — précondition et trace", () => {
  it("refuse (409) une précondition périmée, et le rôle ne bouge pas", async () => {
    await createAtelier();

    const response = await operator()
      .put("/admin/staff-roles/atelier")
      .set(AGENT_TOOL_HEADER, "role_grant")
      .send({ ...GRANTED, expectedPermissions: ["b2b_orders:read", "b2b_orders:write"] })
      .expect(409);

    expect(jsonBody<{ code: string; message: string }>(response)).toMatchObject({
      code: "staff.role.changed_since_read",
      message: expect.stringContaining("a changé depuis votre lecture") as unknown,
    });
    expect((await roleOf("atelier")).permissions).toEqual(["b2b_orders:read"]);
  });

  it("écrit sur une précondition juste, et range l'outil dans le fait", async () => {
    await createAtelier();
    const read = await roleOf("atelier");

    await operator()
      .put("/admin/staff-roles/atelier")
      .set(AGENT_TOOL_HEADER, "role_grant")
      .send({ ...GRANTED, expectedPermissions: read.permissions })
      .expect(204);

    const facts = await factsAbout("atelier", "staff_role.updated");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ via: { agentTool: "role_grant" } });
  });

  it("l'écran — ni précondition, ni en-tête — écrit comme avant, sans `via`", async () => {
    await createAtelier();

    await operator().put("/admin/staff-roles/atelier").send(GRANTED).expect(204);

    const facts = await factsAbout("atelier", "staff_role.updated");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).not.toHaveProperty("via");
  });

  it("un en-tête hors forme n'entre pas au journal", async () => {
    await createAtelier();

    await operator()
      .put("/admin/staff-roles/atelier")
      .set(AGENT_TOOL_HEADER, "<script>")
      .send(GRANTED)
      .expect(204);

    const facts = await factsAbout("atelier", "staff_role.updated");
    expect(facts[0]?.payload).not.toHaveProperty("via");
  });
});

describe("PATCH admin/staff-users/:id — précondition et trace", () => {
  const PRICING = { resource: "b2b_pricing", action: "write", effect: "allow" } as const;

  async function createCecile(): Promise<string> {
    const response = await operator()
      .post("/admin/staff-users")
      .send({
        firstName: "Cécile",
        lastName: "Martin",
        email: "cecile@lfc.test",
        role: "commercial",
        overrides: [PRICING],
      })
      .expect(201);
    return jsonBody<CreatedStaffUserResponse>(response).id;
  }

  /** La fiche entière telle que lue, rôle changé — ce que `staff_assign_role` renvoie. */
  function reassigned(person: StaffUserView, role: string) {
    return {
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone,
      jobTitle: person.jobTitle,
      role,
      overrides: person.overrides,
    };
  }

  it("refuse (409) une fiche modifiée depuis la lecture — une dérogation suffit", async () => {
    const id = await createCecile();
    const read = await personOf(id);
    // Un autre geste, entre la lecture et l'écriture : une dérogation de plus.
    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({
        ...reassigned(read, "commercial"),
        overrides: [...read.overrides, { resource: "b2b_alerts", action: "read", effect: "allow" }],
      })
      .expect(204);

    const response = await operator()
      .patch(`/admin/staff-users/${id}`)
      .set(AGENT_TOOL_HEADER, "staff_assign_role")
      .send({ ...reassigned(read, "support"), expectedUpdatedAt: read.updatedAt })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("staff_user.changed_since_read");
    expect((await personOf(id)).role).toBe("commercial");
  });

  it("écrit sur une date juste, garde les dérogations, et range l'outil", async () => {
    const id = await createCecile();
    const read = await personOf(id);

    await operator()
      .patch(`/admin/staff-users/${id}`)
      .set(AGENT_TOOL_HEADER, "staff_assign_role")
      .send({ ...reassigned(read, "support"), expectedUpdatedAt: read.updatedAt })
      .expect(204);

    const after = await personOf(id);
    expect(after.role).toBe("support");
    expect(after.overrides).toEqual([PRICING]);
    const facts = await factsAbout(id, "staff_user.role_changed");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ via: { agentTool: "staff_assign_role" } });
  });

  it("l'écran — sans précondition — écrit comme avant, sans `via`", async () => {
    const id = await createCecile();
    const read = await personOf(id);

    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send(reassigned(read, "support"))
      .expect(204);

    const facts = await factsAbout(id, "staff_user.role_changed");
    expect(facts[0]?.payload).not.toHaveProperty("via");
  });
});
