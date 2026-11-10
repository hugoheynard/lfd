import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { ALL_SHELVES } from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { GeneralOrderCutoffRule } from "../../domain/general-order-cutoff.js";
import { PrismaGeneralOrderCutoffRepository } from "../prisma-general-order-cutoff.repository.js";

/** L'heure limite générale se lit dans tous les rayons : la changer les efface tous (C1). */
describe("Heures limites — le signal des rayons", () => {
  async function repository(upsert: () => Promise<object>): Promise<{
    readonly repo: PrismaGeneralOrderCutoffRepository;
    readonly shelves: RecordingShelfChanges;
  }> {
    const shelves = new RecordingShelfChanges();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaGeneralOrderCutoffRepository,
        { provide: PrismaService, useValue: { orderCutoff: { upsert } } },
        { provide: ShelfChanges, useValue: shelves },
      ],
    }).compile();
    return { repo: moduleRef.get(PrismaGeneralOrderCutoffRepository), shelves };
  }

  const rule = GeneralOrderCutoffRule.rehydrate("c1", {
    daysBefore: 1,
    time: "18:00",
    graceMinutes: 0,
  });

  it("une heure limite enregistrée efface tous les rayons", async () => {
    const { repo, shelves } = await repository(() => Promise.resolve({}));
    await repo.save(rule);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  it("une écriture refusée n'émet rien", async () => {
    const { repo, shelves } = await repository(() => Promise.reject(new RangeError("base")));
    await expect(repo.save(rule)).rejects.toThrow();
    expect(shelves.scopes).toEqual([]);
  });
});
