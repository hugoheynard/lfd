import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { preparedNoel } from "../../application/commands/__tests__/operation-doubles.js";
import { PrismaOperationRepository } from "../prisma-operation.repository.js";

/** Une unité de travail qui note si une écriture part pendant qu'elle est ouverte. */
class RecordingUnitOfWork extends UnitOfWork {
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

/** Une opération datée se lit dans tous les rayons : l'écrire les efface tous (C1). */
describe("Opérations — le signal des rayons", () => {
  async function repository(): Promise<{
    readonly repo: PrismaOperationRepository;
    readonly shelves: RecordingShelfChanges;
    readonly writes: readonly { readonly statement: string; readonly inUnit: boolean }[];
  }> {
    const shelves = new RecordingShelfChanges();
    const uow = new RecordingUnitOfWork();
    const writes: { statement: string; inUnit: boolean }[] = [];
    const done = (statement: string) => () => {
      writes.push({ statement, inUnit: uow.open });
      return Promise.resolve({ count: 1 });
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaOperationRepository,
        {
          provide: PrismaService,
          useValue: {
            catalogOperation: { create: done("create"), update: done("update") },
            catalogOperationItem: {
              createMany: done("createMany"),
              deleteMany: done("deleteMany"),
            },
          },
        },
        { provide: ShelfChanges, useValue: shelves },
        { provide: UnitOfWork, useValue: uow },
      ],
    }).compile();
    return { repo: moduleRef.get(PrismaOperationRepository), shelves, writes };
  }

  it("une opération ajoutée efface tous les rayons", async () => {
    const { repo, shelves } = await repository();
    await repo.add(preparedNoel());
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  it("une opération enregistrée efface tous les rayons", async () => {
    const { repo, shelves } = await repository();
    await repo.save(preparedNoel());
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  /**
   * Régression : `save` écrivait l'opération, effaçait ses articles et les
   * recréait en trois instructions hors transaction ; une lecture entre les
   * deux dernières voyait une opération vide (plan-materiaux-du-catalogue.md,
   * § 11, lot M1a, 2026-11-06).
   */
  it("enregistre l'opération et ses articles dans une seule unité de travail", async () => {
    const { repo, writes } = await repository();
    const operation = preparedNoel();
    operation.select(["BUCHE-6"], { by: "staff_jour", at: new Date("2026-10-02T09:00:00.000Z") });
    await repo.save(operation);
    expect(writes.map((write) => write.statement)).toEqual(["update", "deleteMany", "createMany"]);
    expect(writes.every((write) => write.inUnit)).toBe(true);
  });
});
