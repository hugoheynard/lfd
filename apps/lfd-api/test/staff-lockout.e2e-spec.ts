/**
 * E2E de **la porte de secours** : on ne peut pas se verrouiller dehors.
 *
 * Un système de permissions a une façon spectaculaire d'échouer — fonctionner
 * parfaitement, et enfermer tout le monde à l'extérieur. Les invariants qui
 * l'empêchent sont testés unitairement dans `staff-access.policy.spec.ts`, mais
 * une politique pure ne prouve rien toute seule : encore faut-il que **les
 * vraies routes l'appellent**. Un handler qui oublierait de la consulter
 * passerait tous les tests de domaine et ouvrirait la trappe.
 *
 * D'où cette suite : les mêmes règles, mais traversées par HTTP, avec le vrai
 * repository et la vraie base. C'est la seule preuve qui compte le jour où on
 * se trompe.
 *
 * Modèle : `documentation/b2b/architecture-acces-staff.md` §6.
 */
import type { CreatedStaffUserResponse, StaffUserView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL } from "../src/staff-users/domain/bootstrap-admin.js";
import { StaffUserRepository } from "../src/staff-users/domain/staff-user.repository.js";
import { bootstrapE2e, E2E_STAFF_EMAIL, jsonBody, type E2eContext } from "./e2e-harness.js";

/** L'administrateur qui opère : c'est LUI qui tentera les gestes interdits. */
const ADMIN_SUB = "staff-admin";
const ADMIN_EMAIL = "admin.ops@lfc.test";

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
  // `reset()` vide les tables : la racine, semée une seule fois au démarrage,
  // disparaît avec. On la re-sème par le **même chemin que le boot** plutôt que
  // par un `create` à la main — sinon la suite prouverait la résistance d'une
  // ligne que le produit ne fabrique pas comme ça.
  await ctx.app.get(StaffUserRepository).ensureBootstrapAdmin();
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Hugo",
      lastName: "Opérateur",
      email: ADMIN_EMAIL,
      role: "admin",
      status: "active",
      auth0Id: ADMIN_SUB,
    },
  });
});

const admin = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(ADMIN_SUB);

/** L'id de la ligne racine, semée au boot par `ensureBootstrapAdmin`. */
async function rootId(): Promise<string> {
  const root = await ctx.prisma.staffUser.findUniqueOrThrow({
    where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL },
  });
  return root.id;
}

/** Une charge d'édition complète, telle que l'écran l'enverrait. */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: "Admin",
    lastName: "La Folie Coffee",
    email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL,
    phone: "",
    jobTitle: "",
    role: "admin",
    overrides: [],
    ...over,
  };
}

describe("porte de secours — l'admin racine résiste aux vraies routes", () => {
  it("ne se supprime pas", async () => {
    // Le geste le plus direct, et celui qu'un écran mal gardé offrirait.
    await admin()
      .delete(`/admin/staff-users/${await rootId()}`)
      .expect(409);

    await expect(
      ctx.prisma.staffUser.findUnique({ where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL } }),
    ).resolves.not.toBeNull();
  });

  it("ne se rétrograde pas", async () => {
    await admin()
      .patch(`/admin/staff-users/${await rootId()}`)
      .send(payload({ role: "support" }))
      .expect(409);
  });

  it("ne se renomme pas", async () => {
    // Le chemin en deux temps : renommer d'abord, supprimer ensuite — puisque
    // c'est l'ADRESSE qui identifie la racine, la renommer la désarmerait.
    await admin()
      .patch(`/admin/staff-users/${await rootId()}`)
      .send(payload({ email: "autre@lfc.test" }))
      .expect(409);
  });

  it("ne se suspend pas", async () => {
    // Suspendre ne détruit rien, mais ferme tout — sur la racine, c'est
    // exactement la même perte.
    await admin()
      .patch(`/admin/staff-users/${await rootId()}/status`)
      .send({ status: "suspended" })
      .expect(409);
  });

  it("se laisse éditer sur le reste — ce n'est pas une ligne gelée", async () => {
    // Le pendant indispensable : sans lui, un `409` systématique passerait ces
    // tests sans rien prouver.
    await admin()
      .patch(`/admin/staff-users/${await rootId()}`)
      .send(payload({ firstName: "Racine", jobTitle: "Direction" }))
      .expect(204);
  });

  it("renaît si on l'efface directement en base", async () => {
    // La dernière ligne de défense : quelqu'un avec un accès SQL passe outre
    // toutes les routes. Le boot la ré-assure.
    await ctx.prisma.staffUser.delete({ where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL } });

    await ctx.app.get(StaffUserRepository).ensureBootstrapAdmin();

    await expect(
      ctx.prisma.staffUser.findUnique({ where: { email: DEFAULT_BOOTSTRAP_ADMIN_EMAIL } }),
    ).resolves.not.toBeNull();
  });
});

describe("porte de secours — il reste toujours un administrateur", () => {
  /**
   * Ne laisse **qu'un seul** administrateur vivant, pour que la règle du dernier
   * admin soit celle qu'on observe.
   *
   * Deux lignes sont à écarter, et oublier l'une d'elles rend le test vert pour
   * la mauvaise raison : la **racine**, semée au boot, et l'**opérateur des
   * suites**, que le harness sème lui aussi en `admin`. Chacune est un recours
   * parfaitement valide — c'est bien le but — donc chacune désarme la garde.
   */
  async function keepOnlyOneAdmin(): Promise<void> {
    await ctx.prisma.staffUser.deleteMany({
      where: { email: { in: [DEFAULT_BOOTSTRAP_ADMIN_EMAIL, E2E_STAFF_EMAIL, ADMIN_EMAIL] } },
    });
  }

  it("refuse qu'un administrateur se rétrograde lui-même", async () => {
    const self = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

    await admin()
      .patch(`/admin/staff-users/${self.id}`)
      .send(payload({ email: ADMIN_EMAIL, firstName: "Hugo", role: "commercial" }))
      .expect(409);
  });

  it("refuse qu'un administrateur se suspende lui-même", async () => {
    const self = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

    await admin()
      .patch(`/admin/staff-users/${self.id}/status`)
      .send({ status: "suspended" })
      .expect(409);
  });

  /**
   * **Ce que HTTP ne peut PAS atteindre, et pourquoi il faut le dire.**
   *
   * `LastStaffAdminError` est inatteignable par la route : pour appeler
   * `PATCH /admin/staff-users/:id`, il faut `staff:write`, donc être `admin` —
   * et `otherLivingAdmins` compte les admins **autres que la cible**. Si
   * l'appelant est un admin différent de la cible, ce compte vaut au moins 1 ;
   * si la cible est l'appelant, c'est `SelfDemotionError` qui tombe d'abord.
   *
   * Ce n'est pas du code mort pour autant : c'est la ceinture qui protège du
   * jour où un script, une migration ou une reprise de données appellera le
   * repository directement, sans passer par une identité d'appelant.
   *
   * On l'éprouve donc **là où elle est atteignable** — le vrai repository, la
   * vraie base, avec un auteur qui n'est pas la cible. Écrire ce cas en HTTP
   * aurait produit un test qui passe pour une autre raison que celle annoncée,
   * ce qui est pire que pas de test.
   */
  it("refuse au repository de retirer le dernier administrateur vivant", async () => {
    const id = await create({ role: "admin", email: "seul@lfc.test" });
    await keepOnlyOneAdmin();
    const repository = ctx.app.get(StaffUserRepository);

    await expect(
      repository.update(
        id,
        {
          firstName: "Camille",
          lastName: "Durand",
          email: "seul@lfc.test",
          phone: "",
          jobTitle: "",
          role: "support",
          overrides: [],
        },
        "un-auteur-qui-n-est-pas-la-cible",
      ),
    ).rejects.toMatchObject({ code: "staff_user.last_admin" });
  });

  it("ne compte pas un administrateur suspendu comme un recours", async () => {
    // Même raison : la règle de comptage ne s'observe qu'au repository. Un admin
    // suspendu ne peut pas entrer ; le compter comme relève reviendrait à
    // laisser partir le dernier qui puisse encore ouvrir la porte.
    const survivor = await create({ role: "admin", email: "seul@lfc.test" });
    const reserve = await create({ role: "admin", email: "reserve@lfc.test" });
    await ctx.prisma.staffUser.update({ where: { id: reserve }, data: { status: "suspended" } });
    await keepOnlyOneAdmin();

    await expect(
      ctx.app
        .get(StaffUserRepository)
        .setStatus(survivor, { status: "suspended" }, "un-auteur-qui-n-est-pas-la-cible"),
    ).rejects.toMatchObject({ code: "staff_user.last_admin" });
  });

  it("laisse partir un administrateur dès qu'un autre reste debout", async () => {
    // Le pendant : la garde protège l'accès, elle ne fige pas l'annuaire.
    const id = await create({ role: "admin", email: "partant@lfc.test" });

    await admin().delete(`/admin/staff-users/${id}`).expect(204);
  });
});

async function create(over: Record<string, unknown>): Promise<string> {
  const response = await admin()
    .post("/admin/staff-users")
    .send({
      firstName: "Camille",
      lastName: "Durand",
      email: "camille@lfc.test",
      role: "commercial",
      ...over,
    })
    .expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

describe("porte de secours — l'annuaire ne s'ouvre pas par un écart", () => {
  it("refuse une dérogation qui donnerait l'annuaire à un non-admin", async () => {
    // Obtenir `staff:write` par dérogation, c'est pouvoir se nommer admin dans
    // la foulée : le modèle n'aurait plus de sommet.
    const id = await create({ role: "support", email: "support@lfc.test" });

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send(
        payload({
          email: "support@lfc.test",
          firstName: "Camille",
          lastName: "Durand",
          role: "support",
          overrides: [{ resource: "staff", action: "write", effect: "allow" }],
        }),
      )
      .expect(409);
  });

  it("refuse une dérogation qui priverait un administrateur de l'annuaire", async () => {
    // L'autre bout de la même garde : sinon l'admin serait là, mais privé du
    // seul droit qui permet d'en désigner un autre.
    const id = await create({ role: "admin", email: "second@lfc.test" });

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send(
        payload({
          email: "second@lfc.test",
          firstName: "Camille",
          lastName: "Durand",
          role: "admin",
          overrides: [{ resource: "staff", action: "write", effect: "deny" }],
        }),
      )
      .expect(409);
  });

  it("laisse une dérogation inoffensive passer", async () => {
    const id = await create({ role: "support", email: "support@lfc.test" });

    await admin()
      .patch(`/admin/staff-users/${id}`)
      .send(
        payload({
          email: "support@lfc.test",
          firstName: "Camille",
          lastName: "Durand",
          role: "support",
          overrides: [{ resource: "growth", action: "read", effect: "allow" }],
        }),
      )
      .expect(204);

    const response = await admin().get("/admin/staff-users").expect(200);
    const rows = jsonBody<readonly StaffUserView[]>(response);
    const updated = rows.find((row) => row.id === id);

    expect(updated?.permissions).toContain("growth:read");
  });
});
