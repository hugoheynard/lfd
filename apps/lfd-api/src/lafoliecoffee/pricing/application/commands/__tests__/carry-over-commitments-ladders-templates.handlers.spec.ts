/**
 * **Reporter un barème, un engagement, un gabarit** sur la référence née d'un détachement (`plan-report-apres-detachement.md`,
 * § 3, § 7) : la filiation et la vente AVANT toute écriture, le verrou puis
 * la relecture et « déjà reportée » DANS l'unité de travail, le journal écrit
 * une fois. La règle et le plancher : `carry-over-decisions.handlers.spec.ts`.
 *
 * Ports doublés par de vraies sous-classes. Les dates ne sont comparées qu'à
 * l'horloge figée de la fixture.
 */
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ArticleSaleUnits } from "../../../../catalog/application/article-sale-units.service.js";
import { PriceTemplate } from "../../../domain/entities/price-template.js";
import { VolumeCommitmentAggregate } from "../../../domain/entities/volume-commitment.js";
import { VolumeLadderAggregate } from "../../../domain/entities/volume-ladder.js";
import { PriceTemplateRepository } from "../../../domain/ports/price-template.repository.js";
import {
  DecisionAlreadyCarriedError,
  NotDetachedFromError,
} from "../../../domain/pricing-errors.js";
import { InMemoryReservedElsewhere } from "../../../infrastructure/in-memory-reserved-elsewhere.js";
import { InMemorySaleReferenceLineage } from "../../../infrastructure/in-memory-sale-reference-lineage.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { CarryOverPriceTemplateLineCommand } from "../carry-over-price-template-line.command.js";
import { CarryOverPriceTemplateLineHandler } from "../carry-over-price-template-line.handler.js";
import { CarryOverVolumeCommitmentCommand } from "../carry-over-volume-commitment.command.js";
import { CarryOverVolumeCommitmentHandler } from "../carry-over-volume-commitment.handler.js";
import { CarryOverVolumeLadderCommand } from "../carry-over-volume-ladder.command.js";
import { CarryOverVolumeLadderHandler } from "../carry-over-volume-ladder.handler.js";
import {
  NamedCompanies,
  PieceOnlyCatalog,
  InMemoryCarried,
  StoredCommitments,
  StoredLadders,
  TracingLock,
} from "./carry-over.doubles.js";
import { TracingUnitOfWork, type Trace } from "./mercuriale-amendment.doubles.js";

const NOW = new Date("2026-03-01T09:00:00.000Z");
const days = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);
const OLD = "CHO-000-2";
const NEW = "CHO-001";
const REASON = `Report de la déclinaison détachée ${OLD}`;
const LINEAGE = new InMemorySaleReferenceLineage({ [NEW]: OLD });

describe("CarryOverVolumeLadderHandler", () => {
  function setup(carried: readonly string[] = []) {
    const old = VolumeLadderAggregate.pose(
      "lad_old",
      {
        scope: { type: "variant", id: OLD },
        audience: { type: "all", id: null },
        unit: "percent",
        tiers: [{ minQuantity: 10, value: 500 }],
        label: "Volume",
        validFrom: days(-10),
        validTo: null,
      },
      "staff|marie",
    );
    const trace: Trace = [];
    const uow = new TracingUnitOfWork(trace);
    const ladders = new StoredLadders(old);
    const handler = new CarryOverVolumeLadderHandler(
      ladders,
      LINEAGE,
      new InMemorySaleReferences([NEW]),
      new InMemoryReservedElsewhere(),
      new InMemoryCarried(trace, uow, { volume_ladder: carried }),
      new TracingLock(trace, uow),
      new FixedIdGenerator("lad"),
      new FixedClock(NOW),
      uow,
    );
    const run = () =>
      handler.execute(new CarryOverVolumeLadderCommand("lad_old", OLD, NEW, REASON, "staff|paul"));
    return { ladders, run };
  }

  it("pose un barème neuf, journalisé `posed` avec le motif", async () => {
    const { ladders, run } = setup();

    await expect(run()).resolves.toBe("lad_000001");

    expect(ladders.posed[0]?.ladder.asLadder.scope).toEqual({ type: "variant", id: NEW });
    expect(ladders.posed[0]?.act).toMatchObject({ kind: "posed", reason: REASON });
  });

  it("refuse un second report pour la même audience", async () => {
    const { ladders, run } = setup(["all:"]);
    await expect(run()).rejects.toBeInstanceOf(DecisionAlreadyCarriedError);
    expect(ladders.posed).toEqual([]);
  });
});

describe("CarryOverVolumeCommitmentHandler", () => {
  const old = () =>
    VolumeCommitmentAggregate.sign(
      "vc_old",
      {
        companyId: "co_1",
        scope: { type: "variant", id: OLD },
        promisedQuantity: 500,
        validFrom: days(-10),
        validTo: days(60),
      },
      "staff|marie",
    );

  function setup(carried: readonly string[] = []) {
    const trace: Trace = [];
    const uow = new TracingUnitOfWork(trace);
    const commitments = new StoredCommitments(old());
    const events = new RecordingPublisher();
    const handler = new CarryOverVolumeCommitmentHandler(
      commitments,
      LINEAGE,
      new InMemorySaleReferences([NEW]),
      new InMemoryReservedElsewhere(),
      new InMemoryCarried(trace, uow, { volume_commitment: carried }),
      new TracingLock(trace, uow),
      new ArticleSaleUnits(new PieceOnlyCatalog()),
      new NamedCompanies(),
      events,
      new FixedIdGenerator("vc"),
      new FixedClock(NOW),
      uow,
    );
    const run = () =>
      handler.execute(
        new CarryOverVolumeCommitmentCommand("vc_old", OLD, NEW, REASON, "staff|paul"),
      );
    return { commitments, events, run };
  }

  it("signe la même promesse sur la nouvelle référence, et la journalise une fois", async () => {
    const { commitments, events, run } = setup();

    await expect(run()).resolves.toBe("vc_000001");

    expect(commitments.signed.map((signed) => signed.asCommitment)).toEqual([
      {
        id: "vc_000001",
        companyId: "co_1",
        scope: { type: "variant", id: NEW },
        promisedQuantity: 500,
        validFrom: NOW,
        validTo: days(60),
      },
    ]);
    expect(events.published).toHaveLength(1);
  });

  it("refuse un second report pour la même société", async () => {
    const { commitments, run } = setup(["co_1"]);
    await expect(run()).rejects.toBeInstanceOf(DecisionAlreadyCarriedError);
    expect(commitments.signed).toEqual([]);
  });
});

class StoredTemplates extends PriceTemplateRepository {
  readonly saved: PriceTemplate[] = [];
  constructor(private readonly stored: PriceTemplate | null) {
    super();
  }
  save(template: PriceTemplate): Promise<void> {
    this.saved.push(template);
    return Promise.resolve();
  }
  load(): Promise<PriceTemplate | null> {
    return Promise.resolve(this.stored);
  }
}

describe("CarryOverPriceTemplateLineHandler", () => {
  const template = PriceTemplate.compose(
    "tpl_1",
    {
      kind: "mercuriale",
      label: "Hôtels",
      lines: [
        { sku: OLD, tiers: [{ minQuantity: 1, unitPriceMillicents: 1 }], plannedVolume: null },
      ],
    },
    "staff|marie",
  );

  it("remplace la ligne de l'ancienne référence et enregistre le gabarit", async () => {
    const templates = new StoredTemplates(template);
    const handler = new CarryOverPriceTemplateLineHandler(
      templates,
      LINEAGE,
      new InMemorySaleReferences([NEW]),
    );

    await expect(
      handler.execute(new CarryOverPriceTemplateLineCommand("tpl_1", OLD, NEW, REASON, "s")),
    ).resolves.toBe("tpl_1");
    expect(templates.saved[0]?.lines.map((line) => line.sku)).toEqual([NEW]);
  });

  it("refuse une référence qui n'est pas née de l'ancienne", async () => {
    const templates = new StoredTemplates(template);
    const handler = new CarryOverPriceTemplateLineHandler(
      templates,
      new InMemorySaleReferenceLineage({}),
      new InMemorySaleReferences([NEW]),
    );
    await expect(
      handler.execute(new CarryOverPriceTemplateLineCommand("tpl_1", OLD, NEW, REASON, "s")),
    ).rejects.toBeInstanceOf(NotDetachedFromError);
    expect(templates.saved).toEqual([]);
  });
});
