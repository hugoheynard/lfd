import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { preparedNoel } from "../../application/commands/__tests__/operation-doubles.js";
import { PrismaOperationRepository } from "../prisma-operation.repository.js";

/** Une opération datée se lit dans tous les rayons : l'écrire les efface tous (C1). */
describe("Opérations — le signal des rayons", () => {
  async function repository(): Promise<{
    readonly repo: PrismaOperationRepository;
    readonly shelves: RecordingShelfChanges;
  }> {
    const shelves = new RecordingShelfChanges();
    const done = () => Promise.resolve({ count: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaOperationRepository,
        {
          provide: PrismaService,
          useValue: {
            catalogOperation: { create: done, update: done },
            catalogOperationItem: { createMany: done, deleteMany: done },
          },
        },
        { provide: ShelfChanges, useValue: shelves },
      ],
    }).compile();
    return { repo: moduleRef.get(PrismaOperationRepository), shelves };
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
});
