import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL as BOOTSTRAP_ADMIN_EMAIL } from "../../../../platform/config/bootstrap-admin-email.js";
import {
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
} from "../../domain/staff-user-errors.js";
import { StaffRoleNotAssignableError } from "../../../permissions/domain/staff-role-errors.js";
import { ACTOR, buildRepo, fakePrisma, holding, payload, row, TODAY } from "./fake-staff-prisma.js";

const SUSPEND = { status: "suspended" } as const;

describe("PrismaStaffUserRepository — admin racine protégé", () => {
  it("refuse de suspendre l'admin racine et ne touche pas la base", async () => {
    const { prisma, updated } = fakePrisma(
      row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, ...holding("admin") }),
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
      row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, ...holding("admin") }),
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
    const { prisma, updated } = fakePrisma(row({ ...holding("admin") }), 0);
    const repo = await buildRepo(prisma);

    await expect(repo.setStatus("u1", SUSPEND, ACTOR)).rejects.toBeInstanceOf(LastStaffAdminError);
    expect(updated).toHaveLength(0);
  });

  it("reconnaît l'auteur par l'id de sa fiche, plus par sa liaison Auth0", async () => {
    // Depuis le lot 2 du plan `plan-journal-de-l-annuaire.md`, le contrôleur
    // passe l'id de fiche de l'auteur (`@StaffUserId()`). Une liaison Auth0
    // égale à cet id n'est qu'une coïncidence, pas une identité.
    const { prisma } = fakePrisma(row({ id: ACTOR, ...holding("admin"), auth0Id: null }));
    const repo = await buildRepo(prisma);

    await expect(repo.setStatus(ACTOR, SUSPEND, ACTOR)).rejects.toBeInstanceOf(SelfDemotionError);
  });

  it("n'est plus dupe d'un `sub` égal à l'identifiant de l'auteur", async () => {
    const { prisma, updated } = fakePrisma(row({ ...holding("admin"), auth0Id: ACTOR }));
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

describe("PrismaStaffUserRepository — attribuer une CLÉ de rôle (plan roles-lus-en-base §3.5)", () => {
  /** Une définition créée à l'écran, rendue par la lecture `FOR SHARE`. */
  function withDefinition(definition: { readonly key: string; readonly archived_at: Date | null }) {
    const fake = fakePrisma(row());
    const prisma = {
      ...fake.prisma,
      $queryRaw: (_sql: TemplateStringsArray, key: string): Promise<unknown[]> =>
        Promise.resolve(
          key === definition.key
            ? [
                {
                  ...definition,
                  label: "Vendeur du marché",
                  grants: [{ resource: "b2b_orders", action: "read" }],
                },
              ]
            : [],
        ),
    };
    return { prisma, updated: fake.updated };
  }

  it("écrit la clé ET l'enum pour un rôle du contrat", async () => {
    const { prisma, updated } = fakePrisma(row());
    const repo = await buildRepo(prisma);

    const edit = await repo.update("u1", payload({ role: "support" }), ACTOR);

    expect(updated[0]?.data).toMatchObject({ roleKey: "support", role: "support" });
    expect(edit.roleLabels).toEqual({ before: "Commercial", after: "Support" });
  });

  it("écrit la clé seule, l'enum à NULL, pour un rôle créé à l'écran", async () => {
    // `role` est écrit NUL, pas omis : la colonne a un défaut, et le
    // déclencheur recopierait ce défaut dans `role_key`.
    const { prisma, updated } = withDefinition({ key: "vendeur-marche", archived_at: null });
    const repo = await buildRepo(prisma);

    await repo.update("u1", payload({ role: "vendeur-marche" }), ACTOR);

    expect(updated[0]?.data).toMatchObject({ roleKey: "vendeur-marche", role: null });
  });

  it("refuse un rôle archivé, et n'écrit rien", async () => {
    const { prisma, updated } = withDefinition({
      key: "vendeur-marche",
      archived_at: new Date(0),
    });
    const repo = await buildRepo(prisma);

    await expect(
      repo.update("u1", payload({ role: "vendeur-marche" }), ACTOR),
    ).rejects.toBeInstanceOf(StaffRoleNotAssignableError);
    expect(updated).toHaveLength(0);
  });

  it("refuse une clé qu'aucune définition ne porte — `superadmin` compris", async () => {
    const { prisma } = fakePrisma(row());
    const repo = await buildRepo(prisma);

    await expect(repo.update("u1", payload({ role: "superadmin" }), ACTOR)).rejects.toBeInstanceOf(
      StaffRoleNotAssignableError,
    );
  });
});

describe("PrismaStaffUserRepository — la fiche de secours montre son rôle EFFECTIF", () => {
  const ROOT = row({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL, ...holding("admin") });

  it("se lit `superadmin`, avec `isRescue`, et les autres restent sur leur clé", async () => {
    const { prisma } = fakePrisma(ROOT);
    const repo = await buildRepo({
      ...prisma,
      staffUser: {
        ...(prisma as { staffUser: object }).staffUser,
        findMany: (): Promise<unknown[]> => Promise.resolve([ROOT, row()]),
      },
    });

    const [root, other] = await repo.list();

    expect(root).toMatchObject({
      role: "superadmin",
      roleLabel: "Super administrateur",
      isRescue: true,
    });
    expect(other).toMatchObject({ role: "commercial", roleLabel: "Commercial", isRescue: false });
  });

  it("renvoyer `superadmin` veut dire « inchangé » : la clé écrite reste `admin`", async () => {
    const { prisma, updated } = fakePrisma(ROOT);
    const repo = await buildRepo(prisma);

    await repo.update(
      "root",
      payload({ email: BOOTSTRAP_ADMIN_EMAIL, role: "superadmin", phone: "0600000000" }),
      ACTOR,
    );

    expect(updated[0]?.data).toMatchObject({
      roleKey: "admin",
      role: "admin",
      phone: "0600000000",
    });
  });
});
