import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { RecordingShelfChanges } from "../../../shared/shelf-changes/domain/__tests__/recording-shelf-changes.js";
import { ShelfChanges } from "../../../shared/shelf-changes/domain/ports/shelf-changes.js";
import {
  ALL_SHELVES,
  companyShelves,
} from "../../../shared/shelf-changes/domain/shelf-change-scope.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { VolumeCommitmentAggregate } from "../../domain/entities/volume-commitment.js";
import type { PriceAudienceType } from "../../domain/price-rule.js";
import type { PricingAct } from "../../domain/pricing-act.js";
import { PricingActWriter } from "../pricing-act.writer.js";
import { PrismaPricingRuleRepository } from "../prisma-pricing-rule.repository.js";
import { PrismaVolumeCommitmentRepository } from "../prisma-volume-commitment.repository.js";

/**
 * Une décision de prix efface les rayons de son audience
 * (`le-rayon-en-cache.md`, partie 1) : une société et ses sites ; un
 * segment ou tous, tout — on ne sait pas énumérer les sociétés d'un segment.
 * Un engagement de volume efface la société qui l'a signé.
 */
const FROM = new Date(0);
const UNTIL = new Date(86_400_000 * 30);

const ACT: PricingAct = {
  subjectType: "rule",
  subjectId: "rule_1",
  kind: "posed",
  actor: "staff_1",
  at: FROM,
  reason: null,
  summary: "règle",
  subjectLabel: "Prix d'hiver",
};

/** L'acte s'écrit sans journal : seule compte ici l'écriture qu'il enveloppe. */
const passThroughActs = {
  around: <T>(_act: PricingAct, write: () => Promise<T>): Promise<T> => write(),
};

const done = () => Promise.resolve({});

async function moduleWith<T>(
  type: new (...args: never[]) => T,
  prisma: object,
): Promise<{ readonly repo: T; readonly shelves: RecordingShelfChanges }> {
  const shelves = new RecordingShelfChanges();
  const moduleRef = await Test.createTestingModule({
    providers: [
      type,
      { provide: PrismaService, useValue: prisma },
      { provide: PricingActWriter, useValue: passThroughActs },
      { provide: ShelfChanges, useValue: shelves },
    ],
  }).compile();
  return { repo: moduleRef.get(type), shelves };
}

function ruleFor(type: PriceAudienceType, id: string | null): PricingRule {
  return PricingRule.create(
    "rule_1",
    {
      stage: "geste",
      scope: { type: "variant", id: "VIE-001-U" },
      audience: { type, id },
      minQuantity: null,
      effect: { nature: "replace", amountMillicents: 180_000 },
      label: "Prix d'hiver",
      validFrom: FROM,
      validTo: UNTIL,
      stacksOverMercuriale: false,
    },
    "staff_1",
  );
}

describe("Prix — le signal des rayons selon l'audience", () => {
  const prisma = { priceRule: { create: done, update: done } };

  it("une règle d'une société efface cette société (et ses sites)", async () => {
    const { repo, shelves } = await moduleWith(PrismaPricingRuleRepository, prisma);
    await repo.save(ruleFor("company", "co_a"), ACT);
    expect(shelves.scopes).toEqual([companyShelves("co_a")]);
  });

  it("une règle de segment efface tout", async () => {
    const { repo, shelves } = await moduleWith(PrismaPricingRuleRepository, prisma);
    await repo.update(ruleFor("segment", "seg_1"), ACT);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });

  it("une règle pour tous efface tout", async () => {
    const { repo, shelves } = await moduleWith(PrismaPricingRuleRepository, prisma);
    await repo.rename(ruleFor("all", null), ACT);
    expect(shelves.scopes).toEqual([ALL_SHELVES]);
  });
});

describe("Engagement de volume — le signal des rayons", () => {
  it("un engagement signé puis clos efface la société qui l'a signé", async () => {
    const { repo, shelves } = await moduleWith(PrismaVolumeCommitmentRepository, {
      volumeCommitment: { create: done, update: done },
    });
    const commitment = VolumeCommitmentAggregate.sign(
      "cmt_1",
      {
        companyId: "co_a",
        scope: { type: "product", id: "VIE-001" },
        promisedQuantity: 6000,
        validFrom: FROM,
        validTo: UNTIL,
      },
      "staff_1",
    );
    await repo.sign(commitment);
    await repo.save(commitment);
    expect(shelves.scopes).toEqual([companyShelves("co_a"), companyShelves("co_a")]);
  });
});
