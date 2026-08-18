import type { StaffRole } from "@lfd/contracts";
import { Test } from "@nestjs/testing";

import { AppConfig } from "../../infra/config/app-config.js";
import { Clock } from "../../infra/time/clock.js";
import { StaffAccessCache } from "../domain/staff-access-cache.port.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL as BOOTSTRAP_ADMIN_EMAIL } from "../domain/bootstrap-admin.js";
import {
  LastStaffAdminError,
  ProtectedStaffUserError,
  SelfDemotionError,
} from "../domain/staff-user-errors.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { PrismaStaffUserRepository } from "./prisma-staff-user.repository.js";

/** Ligne minimale renvoyée par le fake `findUnique` — ce que les gardes lisent. */
interface Row {
  readonly id: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly auth0Id: string | null;
}

interface CreateArgs {
  readonly data: { readonly email: string };
}
interface DeleteArgs {
  readonly where: { readonly id: string };
}

/** Une personne ordinaire de l'annuaire, paramétrable au cas par cas. */
function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "u1",
    email: "commercial@lafoliedouce.com",
    role: "commercial",
    auth0Id: null,
    ...overrides,
  };
}

/**
 * Fake Prisma à closures (le backend évite `jest.fn`) : capture les appels.
 * `otherAdmins` simule le compte des administrateurs restants.
 */
function fakePrisma(
  found: Row | null,
  otherAdmins = 1,
): {
  prisma: { staffUser: Record<string, unknown> };
  deleted: string[];
  created: string[];
} {
  const deleted: string[] = [];
  const created: string[] = [];
  const prisma = {
    staffUser: {
      findUnique: (): Promise<Row | null> => Promise.resolve(found),
      count: (): Promise<number> => Promise.resolve(otherAdmins),
      delete: (args: DeleteArgs): Promise<Row> => {
        deleted.push(args.where.id);
        return Promise.resolve(found ?? row({ id: args.where.id, email: "" }));
      },
      create: (args: CreateArgs): Promise<{ id: string }> => {
        created.push(args.data.email);
        return Promise.resolve({ id: "created" });
      },
    },
  };
  return { prisma, deleted, created };
}

async function buildRepo(prisma: object): Promise<StaffUserRepository> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      {
        provide: AppConfig,
        useValue: { bootstrapAdminEmail: (): string => BOOTSTRAP_ADMIN_EMAIL },
      },
      // Horloge figée : la vue calcule la péremption d'invitation, et un test
      // qui lit l'heure du système finit par échouer un jour précis.
      { provide: Clock, useValue: { now: (): Date => new Date("2026-08-12T12:00:00.000Z") } },
      // Le cache d'accès : ici on ne mesure que le fait d'oublier, pas l'oubli
      // lui-même — c'est la suite e2e qui prouve qu'une suspension mord.
      { provide: StaffAccessCache, useValue: { forgetAll: (): void => undefined } },
      { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    ],
  }).compile();
  return moduleRef.get(StaffUserRepository);
}

const ACTOR = "auth0|moi";

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

  it("reconnaît l'auteur par sa liaison Auth0, pas par son id de fiche", async () => {
    // C'est `auth0Id` qui relie un jeton à une personne. Tant qu'il est nul,
    // le garde-fou est inerte — jamais faux.
    const { prisma } = fakePrisma(row({ role: "admin", auth0Id: ACTOR }));
    const repo = await buildRepo(prisma);

    await expect(repo.remove("u1", ACTOR)).rejects.toBeInstanceOf(SelfDemotionError);
  });

  it("laisse passer quand la fiche n'est liée à personne", async () => {
    const { prisma, deleted } = fakePrisma(row({ role: "admin", auth0Id: null }));
    const repo = await buildRepo(prisma);

    await repo.remove("u1", ACTOR);
    expect(deleted).toEqual(["u1"]);
  });
});
