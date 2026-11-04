import { Test } from "@nestjs/testing";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { PricingMaterialsCache } from "../../../pricing/infrastructure/pricing-materials.cache.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import {
  ALL_SHELVES,
  companyShelves,
} from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { FROM, lineTerms } from "../../domain/__tests__/promotion-terms.fixture.js";
import { Promotion } from "../../domain/promotion.js";
import type { PromotionAct } from "../../domain/promotion-act.js";
import { PrismaPromotionRepository } from "../prisma-promotion.repository.js";

/**
 * Une promotion efface les rayons de ses cibles — celles d'AVANT comprises :
 * une promotion qui quitte une société change aussi le rayon de celle-ci.
 */
const ACT: PromotionAct = {
  subjectId: "promo_1",
  kind: "posed",
  actor: "staff_1",
  at: FROM,
  reason: null,
  summary: "promotion",
  subjectLabel: "Promo d'automne",
};

async function repositoryWith(previous: readonly (string | null)[]): Promise<{
  readonly repo: PrismaPromotionRepository;
  readonly shelves: RecordingShelfChanges;
}> {
  const shelves = new RecordingShelfChanges();
  const done = () => Promise.resolve({ count: 1 });
  const moduleRef = await Test.createTestingModule({
    providers: [
      PrismaPromotionRepository,
      {
        provide: PrismaService,
        useValue: {
          promotion: { upsert: done },
          promotionScopeRule: { deleteMany: done, createMany: done },
          promotionAudienceTarget: {
            findMany: () => Promise.resolve(previous.map((companyId) => ({ companyId }))),
            deleteMany: done,
            createMany: done,
          },
          promotionPickupPoint: { deleteMany: done, createMany: done },
          promotionDeliveryZone: { deleteMany: done, createMany: done },
          pricingEvent: { create: done },
        },
      },
      { provide: UnitOfWork, useValue: new DirectUnitOfWork() },
      { provide: IdGenerator, useValue: new FixedIdGenerator() },
      { provide: Journal, useValue: { append: () => Promise.resolve() } },
      { provide: PricingMaterialsCache, useValue: { invalidate: () => undefined } },
      { provide: ShelfChanges, useValue: shelves },
    ],
  }).compile();
  return { repo: moduleRef.get(PrismaPromotionRepository), shelves };
}

const forCompany = (companyId: string): Promotion =>
  Promotion.pose(
    "promo_1",
    lineTerms({ audience: { kind: "company", companyId } }),
    "staff_1",
    FROM,
  );

describe("Promotions — le signal des rayons selon les cibles", () => {
  it("une promotion posée pour une société efface cette société", async () => {
    const { repo, shelves } = await repositoryWith([]);
    await repo.save(forCompany("co_a"), ACT);
    expect(shelves.scopes).toEqual([companyShelves("co_a")]);
  });

  it("une promotion qui passe d'une société à une autre efface les deux", async () => {
    const { repo, shelves } = await repositoryWith(["co_a"]);
    await repo.save(forCompany("co_b"), ACT);
    expect(shelves.scopes).toEqual([companyShelves("co_b"), companyShelves("co_a")]);
  });

  it("une promotion qui visait plus large qu'une société efface tout", async () => {
    const { repo, shelves } = await repositoryWith([null]);
    await repo.save(forCompany("co_a"), ACT);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });
});
