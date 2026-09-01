/**
 * E2E du **mur staff** : porter un jeton valide ne suffit pas, il faut être
 * quelqu'un — et ce quelqu'un a un périmètre.
 *
 * C'est la suite qui prouve que le modèle d'accès existe pour de bon. Sans elle,
 * `@AdminSurface` serait une annotation dont on espère qu'elle sert à quelque
 * chose. Chaque cas ici correspond à une décision de
 * `documentation/b2b/architecture-acces-staff.md`.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Le comptable : il écrit les commandes, ne touche ni aux réglages ni à l'annuaire. */
const ACCOUNTANT_SUB = "staff-comptable";
const ACCOUNTANT_EMAIL = "compta@lfc.test";

/** Un porteur de jeton parfaitement valide, mais inconnu de l'annuaire. */
const STRANGER_SUB = "staff-inconnu";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; email?: string; scopes: string[] }> =>
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
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Colette",
      lastName: "Bréal",
      email: ACCOUNTANT_EMAIL,
      role: "comptabilite",
      status: "active",
      auth0Id: ACCOUNTANT_SUB,
    },
  });
});

const accountant = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(ACCOUNTANT_SUB);

describe("le mur staff — un jeton valide ne suffit pas", () => {
  it("refuse un porteur inconnu de l'annuaire", async () => {
    // Côté client, un `sub` inconnu est provisionné ; côté staff il est refusé.
    // On ne rejoint pas l'équipe en se connectant.
    await ctx.asSub(STRANGER_SUB).get("/admin/orders").expect(403);
  });

  it("refuse une personne suspendue", async () => {
    // Le geste du départ ferme tout, immédiatement, sans rien détruire.
    await ctx.prisma.staffUser.update({
      where: { email: ACCOUNTANT_EMAIL },
      data: { status: "suspended" },
    });

    await accountant().get("/admin/orders").expect(403);
  });
});

describe("le mur staff — chacun son périmètre", () => {
  it("laisse le comptable lire les commandes", async () => {
    await accountant().get("/admin/orders").expect(200);
  });

  it("lui refuse l'annuaire des utilisateurs", async () => {
    // `staff` n'est ouvert qu'à `admin` : accorder des droits est le seul geste
    // qui permet de s'en accorder.
    await accountant().get("/admin/staff-users").expect(403);
  });

  it("lui laisse LIRE les réglages mais pas les ÉCRIRE", async () => {
    // L'action se déduit du verbe, sans qu'aucune route ait eu à la déclarer :
    // sur la même ressource, le GET passe et l'écriture est refusée. L'id est
    // volontairement introuvable — le guard tranche AVANT que la ressource soit
    // cherchée, donc un 404 ici prouverait déjà qu'on est passé.
    await accountant().get("/admin/order-cutoffs").expect(200);

    const response = await accountant().patch("/admin/order-cutoffs/inexistant").send({});
    expect(response.status).toBe(403);
  });

  it("lui refuse la croissance, qui n'est pas de la donnée comptable", async () => {
    await accountant().get("/admin/cockpit").expect(403);
  });
});

describe("le mur staff — /admin/me", () => {
  it("répond même à qui n'a presque aucun droit", async () => {
    // Sinon il faudrait un droit pour apprendre qu'on n'en a aucun, et l'écran
    // ne pourrait pas se dessiner.
    const response = await accountant().get("/admin/me").expect(200);
    const me = response.body as { role: string; permissions: string[] };

    expect(me.role).toBe("comptabilite");
    expect(me.permissions).toContain("b2b_orders:write");
    expect(me.permissions).not.toContain("staff_access:read");
  });

  it("ne répond pas à un inconnu", async () => {
    await ctx.asSub(STRANGER_SUB).get("/admin/me").expect(403);
  });
});

describe("le mur staff — une décision mord tout de suite", () => {
  it("ferme l'accès dès la suspension, sans attendre l'expiration du cache", async () => {
    // Le cœur du problème : la résolution garde un cache de 30 s. Sans oubli
    // explicite au moment de la mutation, la personne suspendue continuerait
    // d'entrer pendant une demi-minute — et c'est justement la demi-minute où
    // on suspend dans l'urgence.
    //
    // La lecture qui précède est indispensable : elle **remplit** le cache. Sans
    // elle, le test passerait même sans invalidation, faute de rien à oublier.
    await accountant().get("/admin/orders").expect(200);

    const target = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: ACCOUNTANT_EMAIL },
    });
    await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/staff-users/${target.id}/status`)
      .send({ status: "suspended" })
      .expect(204);

    await accountant().get("/admin/orders").expect(403);
  });

  it("applique un changement de rôle sans délai", async () => {
    // Même mécanique dans l'autre sens : ouvrir doit être aussi immédiat que
    // fermer, sinon on croit la mutation perdue et on la refait.
    await accountant().get("/admin/cockpit").expect(403);

    const target = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: ACCOUNTANT_EMAIL },
    });
    await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/staff-users/${target.id}`)
      .send({
        firstName: "Colette",
        lastName: "Bréal",
        email: ACCOUNTANT_EMAIL,
        role: "commercial",
        overrides: [],
      })
      .expect(204);

    await accountant().get("/admin/cockpit").expect(200);
  });
});

describe("le mur staff — la dérogation, en vrai", () => {
  it("ouvre une ressource que le rôle ne donne pas", async () => {
    const staffUser = await ctx.prisma.staffUser.findUniqueOrThrow({
      where: { email: ACCOUNTANT_EMAIL },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: {
        staffUserId: staffUser.id,
        resource: "b2b_growth",
        action: "read",
        effect: "allow",
        grantedBy: "test",
      },
    });

    await accountant().get("/admin/cockpit").expect(200);
  });
});

/**
 * Le balayage : **aucune** surface admin ne répond à quelqu'un que l'annuaire
 * ignore. Une par ressource, parce que c'est le mappage qui peut se tromper —
 * un contrôleur rangé sous la mauvaise ressource ouvrirait une porte au mauvais
 * métier, et le guard n'aurait aucun moyen de s'en apercevoir.
 */
describe("le mur staff — le balayage des huit ressources", () => {
  const SURFACES: readonly { readonly resource: string; readonly path: string }[] = [
    { resource: "b2b_companies", path: "/admin/companies" },
    { resource: "b2b_orders", path: "/admin/orders" },
    { resource: "b2b_growth", path: "/admin/cockpit" },
    { resource: "b2b_appointments", path: "/admin/appointments?from=2026-08-01&to=2026-08-31" },
    { resource: "b2b_support", path: "/admin/support-requests" },
    { resource: "b2b_settings", path: "/admin/order-cutoffs" },
    { resource: "staff_access", path: "/admin/staff-users" },
    { resource: "me", path: "/admin/me" },
  ];

  it.each(SURFACES)("refuse $resource à un inconnu", async ({ path }) => {
    const response = await ctx.asSub(STRANGER_SUB).get(path);

    // 403, jamais 200 — et jamais 404 non plus : une route qui n'existe pas
    // ferait passer ce test sans rien prouver.
    expect(response.status).toBe(403);
  });

  it.each(SURFACES)("ouvre $resource à un administrateur", async ({ path }) => {
    // Le pendant indispensable : sans lui, une faute de frappe dans le chemin
    // rendrait le test précédent vert pour la mauvaise raison.
    await ctx.prisma.staffUser.update({
      where: { email: ACCOUNTANT_EMAIL },
      data: { role: "admin" },
    });

    const response = await accountant().get(path);

    expect(response.status).toBe(200);
  });
});
