import { Test } from "@nestjs/testing";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../domain/bootstrap-admin.js";
import { ProtectedStaffUserError } from "../domain/staff-user-errors.js";
import { StaffUserRepository } from "../domain/staff-user.repository.js";
import { PrismaStaffUserRepository } from "./prisma-staff-user.repository.js";

/** Ligne minimale renvoyée par le fake `findUnique` (id + email suffisent aux gardes). */
interface Row {
  readonly id: string;
  readonly email: string;
}

interface CreateArgs {
  readonly data: { readonly email: string };
}
interface DeleteArgs {
  readonly where: { readonly id: string };
}

/** Fake Prisma à closures (le backend évite `jest.fn`) : capture les appels. */
function fakePrisma(row: Row | null): {
  prisma: { staffUser: Record<string, unknown> };
  deleted: string[];
  created: string[];
} {
  const deleted: string[] = [];
  const created: string[] = [];
  const prisma = {
    staffUser: {
      findUnique: (): Promise<Row | null> => Promise.resolve(row),
      delete: (args: DeleteArgs): Promise<Row> => {
        deleted.push(args.where.id);
        return Promise.resolve(row ?? { id: args.where.id, email: "" });
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
      { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    ],
  }).compile();
  return moduleRef.get(StaffUserRepository);
}

describe("PrismaStaffUserRepository — admin racine ineffaçable", () => {
  it("refuse de supprimer l'admin racine et ne touche pas la base", async () => {
    const { prisma, deleted } = fakePrisma({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL });
    const repo = await buildRepo(prisma);

    await expect(repo.remove("root")).rejects.toBeInstanceOf(ProtectedStaffUserError);
    expect(deleted).toHaveLength(0);
  });

  it("supprime un user staff ordinaire", async () => {
    const { prisma, deleted } = fakePrisma({ id: "u1", email: "commercial@lafoliedouce.com" });
    const repo = await buildRepo(prisma);

    await repo.remove("u1");
    expect(deleted).toEqual(["u1"]);
  });

  it("ensureBootstrapAdmin crée l'admin racine s'il manque", async () => {
    const { prisma, created } = fakePrisma(null);
    const repo = await buildRepo(prisma);

    await repo.ensureBootstrapAdmin();
    expect(created).toEqual([BOOTSTRAP_ADMIN_EMAIL]);
  });

  it("ensureBootstrapAdmin ne recrée rien s'il existe déjà", async () => {
    const { prisma, created } = fakePrisma({ id: "root", email: BOOTSTRAP_ADMIN_EMAIL });
    const repo = await buildRepo(prisma);

    await repo.ensureBootstrapAdmin();
    expect(created).toHaveLength(0);
  });
});
