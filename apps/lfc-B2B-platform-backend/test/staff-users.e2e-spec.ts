/**
 * E2E de l'**annuaire staff** (back-office) : CRUD staff-gated + invariants —
 * e-mail unique (doublon → 409), dérogations dédoublonnées, 404 sur id inconnu,
 * et le garde-fou qui interdit de retirer le **dernier administrateur**. Tout est
 * staff-only (aucune surface publique).
 */
import type { CreatedStaffUserResponse, StaffUserView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_EMAIL, jsonBody, type E2eContext } from "./e2e-harness.js";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

const user = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  firstName: "Alex",
  lastName: "Martin",
  email: "alex.martin@lfc.test",
  role: "commercial",
  ...over,
});

async function create(over: Record<string, unknown> = {}): Promise<string> {
  const response = await staff().post("/admin/staff-users").send(user(over)).expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

/**
 * L'annuaire **sans l'opérateur** des tests. Depuis que la surface admin est
 * murée, la personne qui appelle existe forcément en base ; la compter ferait
 * dire aux assertions autre chose que ce qu'elles veulent dire.
 */
async function list(): Promise<readonly StaffUserView[]> {
  const response = await staff().get("/admin/staff-users").expect(200);
  const rows = jsonBody<readonly StaffUserView[]>(response);
  return rows.filter((row) => row.email !== E2E_STAFF_EMAIL);
}

describe("annuaire staff", () => {
  it("crée un user et le liste avec son effectif de permissions", async () => {
    await create({ jobTitle: "Responsable grands comptes", phone: "06 12 34 56 78" });
    const users = await list();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe("alex.martin@lfc.test");
    expect(users[0]?.jobTitle).toBe("Responsable grands comptes");
    // L'effectif est résolu par le serveur : l'écran n'a pas à rejouer la formule.
    expect(users[0]?.permissions).toContain("companies:write");
    expect(users[0]?.permissions).not.toContain("staff:write");
  });

  it("dédoublonne les dérogations et normalise l'e-mail en minuscule", async () => {
    await create({
      email: "Alex.Martin@LFC.test",
      overrides: [
        { resource: "orders", action: "write", effect: "allow" },
        { resource: "orders", action: "write", effect: "allow" },
      ],
    });
    const users = await list();
    expect(users[0]?.email).toBe("alex.martin@lfc.test");
    expect(users[0]?.overrides).toHaveLength(1);
    expect(users[0]?.permissions).toContain("orders:write");
  });

  it("refuse un e-mail déjà pris (409), casse insensible", async () => {
    await create({ email: "dup@lfc.test" });
    const response = await staff()
      .post("/admin/staff-users")
      .send(user({ email: "DUP@lfc.test", firstName: "Bea" }));
    expect(response.status).toBe(409);
    expect(await list()).toHaveLength(1);
  });

  it("édite un user (nom + rôle)", async () => {
    const id = await create();
    await staff()
      .patch(`/admin/staff-users/${id}`)
      .send(user({ lastName: "Durand", role: "admin" }))
      .expect(204);
    const users = await list();
    expect(users[0]?.lastName).toBe("Durand");
    expect(users[0]?.role).toBe("admin");
    expect(users[0]?.permissions).toContain("staff:write");
  });

  it("refuse d'éditer vers l'e-mail d'un autre user (409)", async () => {
    const first = await create({ email: "one@lfc.test" });
    await create({ email: "two@lfc.test", firstName: "Bea" });
    const response = await staff()
      .patch(`/admin/staff-users/${first}`)
      .send(user({ email: "two@lfc.test" }));
    expect(response.status).toBe(409);
  });

  it("supprime un user", async () => {
    const id = await create();
    await staff().delete(`/admin/staff-users/${id}`).expect(204);
    expect(await list()).toHaveLength(0);
  });

  it("404 sur édition/suppression d'un id inconnu", async () => {
    await staff().patch("/admin/staff-users/nope").send(user()).expect(404);
    await staff().delete("/admin/staff-users/nope").expect(404);
  });
});

/**
 * Ce qu'on prouve **ici**, c'est le câblage : que la règle du domaine remonte
 * jusqu'à un vrai code HTTP. La règle elle-même — « il reste au moins un
 * administrateur » — se prouve sans base dans `staff-access.policy.spec.ts`,
 * parce qu'un e2e ne peut plus l'atteindre : l'opérateur des tests **est** un
 * administrateur, donc personne n'est jamais le dernier.
 */
describe("annuaire staff — on ne se verrouille pas dehors", () => {
  async function operatorId(): Promise<string> {
    const response = await staff().get("/admin/staff-users").expect(200);
    const rows = jsonBody<readonly StaffUserView[]>(response);
    const operator = rows.find((row) => row.email === E2E_STAFF_EMAIL);
    if (operator === undefined) {
      throw new Error("L'opérateur e2e devrait être dans l'annuaire.");
    }
    return operator.id;
  }

  it("refuse qu'on se supprime soi-même (409)", async () => {
    // Le pied dans le plat le plus courant, et le seul qu'on ne peut pas
    // réparer soi-même.
    const response = await staff().delete(`/admin/staff-users/${await operatorId()}`);

    expect(response.status).toBe(409);
  });

  it("refuse qu'on se rétrograde soi-même (409)", async () => {
    // Le chemin le plus discret : pas une suppression, une simple édition de rôle.
    const response = await staff()
      .patch(`/admin/staff-users/${await operatorId()}`)
      .send(user({ email: E2E_STAFF_EMAIL, role: "support" }));

    expect(response.status).toBe(409);
  });

  it("laisse partir un administrateur qui n'est pas soi", async () => {
    const other = await create({ email: "two@lfc.test", firstName: "Bea", role: "admin" });

    await staff().delete(`/admin/staff-users/${other}`).expect(204);

    expect(await list()).toHaveLength(0);
  });

  it("refuse une dérogation qui priverait un admin de l'annuaire (409)", async () => {
    const other = await create({ email: "two@lfc.test", firstName: "Bea", role: "admin" });

    const response = await staff()
      .patch(`/admin/staff-users/${other}`)
      .send(
        user({
          email: "two@lfc.test",
          firstName: "Bea",
          role: "admin",
          overrides: [{ resource: "staff", action: "write", effect: "deny" }],
        }),
      );

    expect(response.status).toBe(409);
  });
});

describe("/admin/me", () => {
  it("dit qui on est et ce qu'on peut faire", async () => {
    const response = await staff().get("/admin/me").expect(200);
    const me = jsonBody<{ email: string; role: string; permissions: string[] }>(response);

    expect(me.email).toBe(E2E_STAFF_EMAIL);
    expect(me.role).toBe("admin");
    // L'administrateur porte tous les pouvoirs : c'est l'invariant qui garantit
    // qu'il reste toujours quelqu'un capable de tout réparer.
    expect(me.permissions).toContain("staff:write");
    expect(me.permissions).toContain("settings:write");
  });
});

describe("annuaire staff — suspendre et réintégrer", () => {
  async function statusOf(email: string): Promise<string | undefined> {
    const rows = await list();
    return rows.find((row) => row.email === email)?.status;
  }

  it("suspend quelqu'un d'autre, sans rien détruire", async () => {
    const id = await create({ email: "two@lfc.test", firstName: "Bea", role: "support" });

    await staff()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "suspended" })
      .expect(204);

    // La fiche est toujours là : on ne supprime pas quelqu'un dont le nom est
    // attaché à des décisions datées ailleurs.
    expect(await statusOf("two@lfc.test")).toBe("suspended");
  });

  it("réintègre", async () => {
    const id = await create({ email: "two@lfc.test", firstName: "Bea", role: "support" });
    await staff()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "suspended" })
      .expect(204);

    await staff().patch(`/admin/staff-users/${id}/status`).send({ status: "active" }).expect(204);

    expect(await statusOf("two@lfc.test")).toBe("active");
  });

  it("refuse qu'on se suspende soi-même (409)", async () => {
    const response = await staff().get("/admin/staff-users").expect(200);
    const rows = jsonBody<readonly StaffUserView[]>(response);
    const me = rows.find((row) => row.email === E2E_STAFF_EMAIL);

    const refused = await staff()
      .patch(`/admin/staff-users/${me?.id ?? "?"}/status`)
      .send({ status: "suspended" });

    expect(refused.status).toBe(409);
  });

  it("refuse un état qui ne se demande pas (400)", async () => {
    // `pending`, `invited` et `active` se CONSTATENT : seul le couple
    // suspendre / réintégrer est un geste délibéré.
    const id = await create({ email: "two@lfc.test", firstName: "Bea", role: "support" });

    const response = await staff()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "invited" });

    expect(response.status).toBe(400);
  });
});

describe("annuaire staff — les bords, jusqu'à la base", () => {
  it("refuse (409) une dérogation qui ouvrirait l'annuaire", async () => {
    // Le chemin d'escalade complet, éprouvé sur la vraie route : un support à
    // qui l'on accorde `staff:write` pourrait ensuite s'attribuer `admin`.
    const id = await create({ email: "two@lfc.test", firstName: "Bea", role: "support" });

    const response = await staff()
      .patch(`/admin/staff-users/${id}`)
      .send(
        user({
          email: "two@lfc.test",
          firstName: "Bea",
          role: "support",
          overrides: [{ resource: "staff", action: "write", effect: "allow" }],
        }),
      );

    expect(response.status).toBe(409);
  });

  it("n'écrit qu'une ligne quand deux dérogations se contredisent, et c'est le refus", async () => {
    // La base ne peut en stocker qu'une : sans normalisation en amont, on
    // validerait un état et on en écrirait un autre.
    const id = await create({
      email: "two@lfc.test",
      firstName: "Bea",
      role: "support",
      overrides: [
        { resource: "orders", action: "write", effect: "allow" },
        { resource: "orders", action: "write", effect: "deny" },
      ],
    });

    const rows = await list();
    const created = rows.find((row) => row.id === id);

    expect(created?.overrides).toHaveLength(1);
    expect(created?.permissions).not.toContain("orders:write");
  });

  it("normalise l'e-mail avant de conclure au doublon, espaces compris", async () => {
    await create({ email: "one@lfc.test" });

    const response = await staff()
      .post("/admin/staff-users")
      .send(user({ email: "  ONE@lfc.TEST  ", firstName: "Bea" }));

    expect(response.status).toBe(409);
  });

  it("refuse un rôle qui n'est pas au catalogue (400)", async () => {
    const response = await staff()
      .post("/admin/staff-users")
      .send(user({ role: "super-admin" }));

    expect(response.status).toBe(400);
  });

  it("refuse une dérogation sur une ressource inconnue (400)", async () => {
    // Le catalogue est fermé : une ressource inventée ne doit pas atterrir en
    // base, où plus rien ne saurait la lire.
    const response = await staff()
      .post("/admin/staff-users")
      .send(user({ overrides: [{ resource: "facturation", action: "read", effect: "allow" }] }));

    expect(response.status).toBe(400);
  });
});
