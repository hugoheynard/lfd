/**
 * E2E des **rôles lus en base** — plan `documentation/staff/plan-roles-lus-en-base.md` §5.
 *
 * Jusqu'au 2026-09-26, le guard résolvait depuis `ROLE_GRANTS`, écrit dans le
 * code, et l'écran Admin › Rôles écrivait une table que personne ne lisait :
 * modifier un rôle n'avait aucun effet, et un rôle créé ne pouvait être porté
 * par personne. Chaque cas ci-dessous éprouve, en vrai HTTP et contre la vraie
 * base, une ligne du plan.
 */
import { staffRoleSchema, type StaffMeView, type StaffPermission } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import type { StaffPrincipal } from "../src/platform/auth/staff-principal.js";
import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL } from "../src/platform/config/bootstrap-admin-email.js";
import { StaffUserRepository } from "../src/staff/directory/domain/staff-user.repository.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

/**
 * Le jeton porteur EST le `sub` (convention du harnais). Un jeton préfixé
 * `claims:` porte en plus des revendications — pour éprouver le secours contre
 * un jeton qui ANNONCE l'adresse de secours.
 */
const stubAdminVerifier = {
  verify: (token: string): Promise<StaffPrincipal> => {
    if (token.startsWith("claims:")) {
      const [, subject = "", email, verified] = token.split(":");
      return Promise.resolve({
        subject,
        email,
        emailVerified: verified === "verified",
        scopes: [],
      });
    }
    return Promise.resolve({
      subject: token,
      email: undefined,
      emailVerified: undefined,
      scopes: [],
    });
  },
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

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Une personne active, liée à `sub`, qui porte `roleKey` — écrite comme le nouveau code l'écrit. */
async function person(
  sub: string,
  roleKey: string,
  overrides: readonly { resource: "b2b_growth"; action: "read"; effect: "allow" }[] = [],
): Promise<string> {
  const builtIn = staffRoleSchema.safeParse(roleKey);
  const created = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: sub,
      email: `${sub}@lfc.test`,
      roleKey,
      role: builtIn.success ? builtIn.data : null,
      status: "active",
      auth0Id: sub,
      overrides: { create: overrides.map((entry) => ({ ...entry })) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Définit un rôle par la route, comme l'écran. */
async function defineRole(
  key: string,
  grants: readonly { resource: string; action: string }[],
): Promise<void> {
  await admin()
    .post("/admin/staff-roles")
    .send({ key, label: `Rôle ${key}`, grants })
    .expect(201);
}

async function permissionsOf(sub: string): Promise<readonly StaffPermission[]> {
  const response = await ctx.asSub(sub).get("/admin/me").expect(200);
  return jsonBody<StaffMeView>(response).permissions;
}

/** Un créneau avant de relâcher un verrou : l'autre geste a eu le temps d'arriver dessus. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 300));

describe("🔴 le test qui manquait — modifier une définition change l'accès sans attendre", () => {
  it("403 puis 200 sur la même personne, sans délai de cache", async () => {
    await person("vendeur", "comptoir");
    await ctx.asSub("vendeur").get("/admin/companies").expect(403);

    await admin()
      .put("/admin/staff-roles/comptoir")
      .send({
        label: "Vendeur comptoir",
        grants: [
          { resource: "b2b_orders", action: "write" },
          { resource: "b2b_counter", action: "read" },
          { resource: "b2b_companies", action: "read" },
        ],
      })
      .expect(204);

    await ctx.asSub("vendeur").get("/admin/companies").expect(200);
  });

  it("et le retrait aussi : 200 puis 403", async () => {
    await person("vendeur", "comptoir");
    await ctx.asSub("vendeur").get("/admin/counter/customers").expect(200);

    await admin()
      .put("/admin/staff-roles/comptoir")
      .send({ label: "Vendeur comptoir", grants: [{ resource: "b2b_orders", action: "read" }] })
      .expect(204);

    await ctx.asSub("vendeur").get("/admin/counter/customers").expect(403);
  });
});

describe("un rôle créé à l'écran s'attribue, et n'ouvre que ce qu'il accorde", () => {
  it("attribué par la fiche : la clé et le libellé, l'enum à NULL", async () => {
    await defineRole("vendeur-marche", [{ resource: "b2b_counter", action: "read" }]);
    const id = await person("marche", "commercial");

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send({
        firstName: "Test",
        lastName: "marche",
        email: "marche@lfc.test",
        role: "vendeur-marche",
      })
      .expect(204);

    const stored = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ roleKey: "vendeur-marche", role: null });
    await ctx.asSub("marche").get("/admin/counter/customers").expect(200);
    await ctx.asSub("marche").get("/admin/companies").expect(403);
    const me = jsonBody<StaffMeView>(await ctx.asSub("marche").get("/admin/me").expect(200));
    expect(me).toMatchObject({ role: "vendeur-marche", roleLabel: "Rôle vendeur-marche" });
  });

  it("refuse une clé qu'aucune définition ne porte", async () => {
    const id = await person("marche", "commercial");

    const response = await admin()
      .patch(`/admin/staff-users/${id}`)
      .send({ firstName: "Test", lastName: "marche", email: "marche@lfc.test", role: "inventee" })
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("staff.role.not_assignable");
  });
});

describe("un rôle archivé", () => {
  it("ne donne plus rien par lui-même : les écarts seuls", async () => {
    await person("vendeur", "comptoir", [
      { resource: "b2b_growth", action: "read", effect: "allow" },
    ]);
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: "comptoir" },
      data: { archivedAt: new Date() },
    });

    expect(await permissionsOf("vendeur")).toEqual(["b2b_growth:read"]);
  });

  it("ne s'archive pas tant qu'il est porté — compté sur la CLÉ, rôle créé à l'écran compris", async () => {
    // Régression (plan §3.3) : le compte lisait l'enum, rendait 0 pour un rôle
    // créé à l'écran, et l'archivage retirait en silence tous leurs droits.
    await defineRole("vendeur-marche", [{ resource: "b2b_counter", action: "read" }]);
    await person("marche", "vendeur-marche");

    await admin().delete("/admin/staff-roles/vendeur-marche").expect(409);
  });
});

describe("des droits illisibles ne font tomber que leur rôle", () => {
  it("ses porteurs n'ont que leurs écarts ; les autres rôles répondent normalement", async () => {
    await person("vendeur", "comptoir", [
      { resource: "b2b_growth", action: "read", effect: "allow" },
    ]);
    await person("commerciale", "commercial");
    // Le cas de la base de dev du 2026-09-25 : une ressource d'une version abandonnée.
    await ctx.prisma.$executeRaw`
      UPDATE "public"."staff_role_definitions"
      SET "grants" = '[{"resource":"storefront"}]'::jsonb
      WHERE "key" = 'comptoir'`;

    expect(await permissionsOf("vendeur")).toEqual(["b2b_growth:read"]);
    await ctx.asSub("commerciale").get("/admin/companies").expect(200);
  });
});

describe("🔴 le secours s'ancre sur la fiche racine LIÉE (plan §3.4)", () => {
  /** La fiche racine, semée par le chemin du boot, liée à `sub`. */
  async function linkedRoot(sub: string): Promise<void> {
    await ctx.app.get(StaffUserRepository).ensureBootstrapAdmin();
    await ctx.prisma.staffUser.update({
      where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL },
      data: { auth0Id: sub, status: "active" },
    });
  }

  it("ouvre tout, même `admin` vidé en base et la fiche sur un rôle archivé", async () => {
    await linkedRoot("secours");
    await defineRole("fantome", [{ resource: "b2b_orders", action: "read" }]);
    await ctx.prisma.staffUser.update({
      where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL },
      data: { roleKey: "fantome", role: null },
    });
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: "fantome" },
      data: { archivedAt: new Date() },
    });
    await ctx.prisma.staffRoleDefinition.update({
      where: { key: "admin" },
      data: { grants: [{ resource: "b2b_orders", action: "read" }] },
    });

    await ctx.asSub("secours").get("/admin/staff-users").expect(200);
    const me = jsonBody<StaffMeView>(await ctx.asSub("secours").get("/admin/me").expect(200));
    expect(me.role).toBe("superadmin");
  });

  it("n'ouvre rien à un jeton qui annonce l'adresse de secours sans être lié à la fiche", async () => {
    await linkedRoot("secours");

    await ctx
      .asSub(`claims:usurpateur:${DEFAULT_BOOTSTRAP_ADMIN_EMAIL}:verified`)
      .get("/admin/staff-users")
      .expect(403);
  });

  it("n'ouvre rien à un jeton non vérifié qui annonce l'adresse d'une racine encore libre", async () => {
    await ctx.app.get(StaffUserRepository).ensureBootstrapAdmin();

    await ctx
      .asSub(`claims:usurpateur:${DEFAULT_BOOTSTRAP_ADMIN_EMAIL}:unverified`)
      .get("/admin/staff-users")
      .expect(403);
    const root = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL },
    });
    expect(root.auth0Id).toBeNull();
  });
});

describe("le déclencheur tient `role_key` en phase de l'ancien code", () => {
  it("l'ancien code qui écrit `role` seul : `role_key` suit", async () => {
    const id = await person("ancien", "comptoir");

    await ctx.prisma.$executeRaw`
      UPDATE "public"."staff_users" SET "role" = 'support' WHERE "id" = ${id}`;

    const stored = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(stored.roleKey).toBe("support");
  });

  it("l'ancien code qui crée une fiche sans `role_key` : elle en reçoit une", async () => {
    await ctx.prisma.$executeRaw`
      INSERT INTO "public"."staff_users" ("id", "first_name", "last_name", "email", "role", "updated_at")
      VALUES ('ancienne-fiche', 'Old', 'Code', 'old@lfc.test', 'dev', CURRENT_TIMESTAMP)`;

    const stored = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { id: "ancienne-fiche" },
    });
    expect(stored.roleKey).toBe("dev");
  });

  it("ne touche pas une fiche qui porte un rôle hors enum", async () => {
    await defineRole("vendeur-marche", [{ resource: "b2b_counter", action: "read" }]);
    const id = await person("marche", "vendeur-marche");

    await ctx.prisma.staffUser.update({ where: { id }, data: { phone: "0600000000" } });

    const stored = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ roleKey: "vendeur-marche", role: null });
  });
});

describe("archiver pendant une attribution — l'un des deux attend, jamais un rôle archivé porté", () => {
  it("attribution en cours (FOR SHARE) : l'archivage attend, puis voit le porteur et refuse", async () => {
    await defineRole("vendeur-marche", [{ resource: "b2b_counter", action: "read" }]);
    const id = await person("marche", "commercial");
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const assignment = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT 1 FROM "public"."staff_role_definitions" WHERE "key" = 'vendeur-marche' FOR SHARE`;
        await tx.staffUser.update({
          where: { id },
          data: { roleKey: "vendeur-marche", role: null },
        });
        locked();
        await gate;
      },
      { timeout: 20_000 },
    );
    await lockTaken;
    let archiveDone = false;
    const archive = admin()
      .delete("/admin/staff-roles/vendeur-marche")
      .then((response) => {
        archiveDone = true;
        return response;
      });
    await settle();

    expect(archiveDone).toBe(false);
    release();
    await assignment;
    expect((await archive).status).toBe(409);
    const role = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "vendeur-marche" },
    });
    expect(role.archivedAt).toBeNull();
  });

  it("archivage en cours (FOR UPDATE) : l'attribution attend, puis relit un rôle archivé et refuse", async () => {
    await defineRole("vendeur-marche", [{ resource: "b2b_counter", action: "read" }]);
    const id = await person("marche", "commercial");
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const archiving = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT 1 FROM "public"."staff_role_definitions" WHERE "key" = 'vendeur-marche' FOR UPDATE`;
        await tx.staffRoleDefinition.update({
          where: { key: "vendeur-marche" },
          data: { archivedAt: new Date() },
        });
        locked();
        await gate;
      },
      { timeout: 20_000 },
    );
    await lockTaken;
    const assign = admin().patch(`/admin/staff-users/${id}`).send({
      firstName: "Test",
      lastName: "marche",
      email: "marche@lfc.test",
      role: "vendeur-marche",
    });
    await settle();
    release();
    await archiving;

    expect((await assign).status).toBe(409);
    const stored = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(stored.roleKey).toBe("commercial");
  });
});

describe("aucun rôle ne vide l'accès à l'annuaire (plan §3.3)", () => {
  const withoutDirectory = {
    label: "Administrateur",
    grants: [{ resource: "b2b_orders", action: "write" }],
  };

  it("se retirer staff_access:write en éditant le rôle qu'on porte → refusé", async () => {
    const response = await admin()
      .put("/admin/staff-roles/admin")
      .send(withoutDirectory)
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("staff.role.self_revoke");
  });

  it("le vider du dernier rôle qui le porte → refusé, même par le secours", async () => {
    await ctx.app.get(StaffUserRepository).ensureBootstrapAdmin();
    await ctx.prisma.staffUser.update({
      where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL },
      data: { auth0Id: "secours", status: "active" },
    });

    const response = await ctx
      .asSub("secours")
      .put("/admin/staff-roles/admin")
      .send(withoutDirectory)
      .expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("staff.role.last_directory_keeper");
    const kept = await ctx.prisma.staffRoleDefinition.findUniqueOrThrow({
      where: { key: "admin" },
    });
    expect(JSON.stringify(kept.grants)).toContain("staff_access");
  });

  it("le permet dès qu'un autre rôle le porte", async () => {
    await defineRole("gardien", [{ resource: "staff_access", action: "write" }]);
    await person("gardienne", "gardien");
    // L'opérateur des suites ne porte plus `admin` : il ne se retire rien.
    await ctx.prisma.staffUser.update({
      where: { id: E2E_STAFF_ID },
      data: { roleKey: "gardien", role: null },
    });

    await admin().put("/admin/staff-roles/admin").send(withoutDirectory).expect(204);
  });
});
