import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { companyShelves } from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { principalCompany } from "../../domain/entities/__tests__/company-hierarchy-fixtures.js";
import { SubAccountFollows } from "../../domain/entities/sub-account-follows.js";
import { PrismaCompanyFollowsRepository } from "../prisma-company-follows.repository.js";
import { PrismaCompanyRepository } from "../prisma-company.repository.js";

/**
 * Le statut, le rattachement et le suivi d'une société décident de son rayon
 * et de celui de ses sites (`le-rayon-en-cache.md`, partie 1) : la
 * portée est la société, jamais tout.
 */
async function moduleWith<T>(
  type: new (...args: never[]) => T,
  prisma: object,
): Promise<{ readonly repo: T; readonly shelves: RecordingShelfChanges }> {
  const shelves = new RecordingShelfChanges();
  const moduleRef = await Test.createTestingModule({
    providers: [
      type,
      { provide: PrismaService, useValue: prisma },
      { provide: IdGenerator, useValue: new FixedIdGenerator() },
      { provide: ShelfChanges, useValue: shelves },
    ],
  }).compile();
  return { repo: moduleRef.get(type), shelves };
}

const done = () => Promise.resolve({});

describe("Comptes — le signal des rayons", () => {
  it("une société suspendue efface son rayon (et ceux de ses sites)", async () => {
    const { repo, shelves } = await moduleWith(PrismaCompanyRepository, {
      company: { update: done },
    });
    const company = principalCompany("active");
    company.suspend("staff");
    await repo.save(company);
    expect(shelves.scopes).toEqual([companyShelves("groupe")]);
  });

  it("le suivi d'un principal efface le rayon du suiveur", async () => {
    const { repo, shelves } = await moduleWith(PrismaCompanyFollowsRepository, {
      companyFollow: { upsert: done },
    });
    await repo.save(SubAccountFollows.reconstitute("chalet", []));
    expect(shelves.scopes).toEqual([companyShelves("chalet")]);
  });
});
