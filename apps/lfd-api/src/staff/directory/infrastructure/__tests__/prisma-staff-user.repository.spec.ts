import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL as BOOTSTRAP_ADMIN_EMAIL } from "../../../../platform/config/bootstrap-admin-email.js";
import {
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
} from "../../domain/staff-user-errors.js";
import { ACTOR, buildRepo, fakePrisma, row } from "./fake-staff-prisma.js";

describe("PrismaStaffUserRepository — admin racine ineffaçable", () => {
  it("refuse de supprimer l'admin racine et ne touche pas la base", async () => {
    const { prisma, deleted } = fakePrisma(
      row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, role: "admin" }),
    );
    const repo = await buildRepo(prisma);

    await expect(repo.remove("root", ACTOR)).rejects.toBeInstanceOf(ProtectedStaffUserError);
    expect(deleted).toHaveLength(0);
  });

  it("supprime un user staff ordinaire", async () => {
    const { prisma, deleted } = fakePrisma(row());
    const repo = await buildRepo(prisma);

    await repo.remove("u1", ACTOR);
    expect(deleted).toEqual(["u1"]);
  });

  it("ensureBootstrapAdmin crée l'admin racine s'il manque", async () => {
    const { prisma, created } = fakePrisma(null);
    const repo = await buildRepo(prisma);

    await repo.ensureBootstrapAdmin();
    expect(created).toEqual([BOOTSTRAP_ADMIN_EMAIL]);
  });

  it("ensureBootstrapAdmin ne recrée rien s'il existe déjà", async () => {
    const { prisma, created } = fakePrisma(
      row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, role: "admin" }),
    );
    const repo = await buildRepo(prisma);

    await repo.ensureBootstrapAdmin();
    expect(created).toHaveLength(0);
  });
});

describe("PrismaStaffUserRepository — les faits que la politique attend", () => {
  it("refuse de supprimer le dernier administrateur", async () => {
    // Le repo ne décide pas : il compte, et la politique tranche. Le zéro ici est
    // le seul fait qui manquait avant cette tranche.
    const { prisma, deleted } = fakePrisma(row({ role: "admin" }), 0);
    const repo = await buildRepo(prisma);

    await expect(repo.remove("u1", ACTOR)).rejects.toBeInstanceOf(LastStaffAdminError);
    expect(deleted).toHaveLength(0);
  });

  it("reconnaît l'auteur par l'id de sa fiche, plus par sa liaison Auth0", async () => {
    // Depuis le lot 2 du plan `plan-journal-de-l-annuaire.md`, le contrôleur
    // passe l'id de fiche de l'auteur (`@StaffUserId()`). Une liaison Auth0
    // égale à cet id n'est qu'une coïncidence, pas une identité.
    const { prisma } = fakePrisma(row({ id: ACTOR, role: "admin", auth0Id: null }));
    const repo = await buildRepo(prisma);

    await expect(repo.remove(ACTOR, ACTOR)).rejects.toBeInstanceOf(SelfDemotionError);
  });

  it("n'est plus dupe d'un `sub` égal à l'identifiant de l'auteur", async () => {
    const { prisma, deleted } = fakePrisma(row({ role: "admin", auth0Id: ACTOR }));
    const repo = await buildRepo(prisma);

    await repo.remove("u1", ACTOR);
    expect(deleted).toEqual(["u1"]);
  });
});
