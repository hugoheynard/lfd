import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL as BOOTSTRAP_ADMIN_EMAIL } from "../../../../platform/config/bootstrap-admin-email.js";
import {
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
} from "../../domain/staff-user-errors.js";
import { ACTOR, buildRepo, fakePrisma, row, TODAY } from "./fake-staff-prisma.js";

const SUSPEND = { status: "suspended" } as const;

describe("PrismaStaffUserRepository — admin racine protégé", () => {
  it("refuse de suspendre l'admin racine et ne touche pas la base", async () => {
    const { prisma, updated } = fakePrisma(
      row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, role: "admin" }),
    );
    const repo = await buildRepo(prisma);

    await expect(repo.setStatus("root", SUSPEND, ACTOR)).rejects.toBeInstanceOf(
      ProtectedStaffUserError,
    );
    expect(updated).toHaveLength(0);
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
  it("refuse de suspendre le dernier administrateur", async () => {
    // Le repo ne décide pas : il compte, et la politique tranche. Le zéro ici est
    // le seul fait qui manquait avant cette tranche.
    const { prisma, updated } = fakePrisma(row({ role: "admin" }), 0);
    const repo = await buildRepo(prisma);

    await expect(repo.setStatus("u1", SUSPEND, ACTOR)).rejects.toBeInstanceOf(LastStaffAdminError);
    expect(updated).toHaveLength(0);
  });

  it("reconnaît l'auteur par l'id de sa fiche, plus par sa liaison Auth0", async () => {
    // Depuis le lot 2 du plan `plan-journal-de-l-annuaire.md`, le contrôleur
    // passe l'id de fiche de l'auteur (`@StaffUserId()`). Une liaison Auth0
    // égale à cet id n'est qu'une coïncidence, pas une identité.
    const { prisma } = fakePrisma(row({ id: ACTOR, role: "admin", auth0Id: null }));
    const repo = await buildRepo(prisma);

    await expect(repo.setStatus(ACTOR, SUSPEND, ACTOR)).rejects.toBeInstanceOf(SelfDemotionError);
  });

  it("n'est plus dupe d'un `sub` égal à l'identifiant de l'auteur", async () => {
    const { prisma, updated } = fakePrisma(row({ role: "admin", auth0Id: ACTOR }));
    const repo = await buildRepo(prisma);

    await repo.setStatus("u1", SUSPEND, ACTOR);
    expect(updated.map((args) => args.where.id)).toEqual(["u1"]);
  });
});

describe("PrismaStaffUserRepository — la table des `sub`", () => {
  it("inscrit le `sub` d'une invitation, dans la même écriture que la liaison", async () => {
    // `auth0_id` ne garde que le dernier `sub` ; la table les garde tous (
    // `architecture-journalisation.md` §12, D5.1).
    const { prisma, updated, aliases } = fakePrisma(row({ status: "pending" }));
    const repo = await buildRepo(prisma);

    await repo.markInvited("u1", "auth0|camille", TODAY);

    expect(updated.map((args) => args.data["auth0Id"])).toEqual(["auth0|camille"]);
    expect(aliases).toEqual([{ sub: "auth0|camille", staffUserId: "u1", source: "linked" }]);
  });
});
