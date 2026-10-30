import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../../../catalog/domain/ports/catalog.reader.js";
import { PricedCompanyNamer } from "../../../domain/ports/priced-company-namer.js";
import type { CarriedFamily } from "../../../domain/entities/decision-carry-over.js";
import type { PricingFloor } from "../../../domain/entities/pricing-floor.js";
import type { PricingRule } from "../../../domain/entities/pricing-rule.js";
import type { VolumeCommitmentAggregate } from "../../../domain/entities/volume-commitment.js";
import type { VolumeLadderAggregate } from "../../../domain/entities/volume-ladder.js";
import type { PricingAct } from "../../../domain/pricing-act.js";
import { CarriedDecisionsReader } from "../../../domain/ports/carried-decisions.reader.js";
import {
  CarriedFloorRepository,
  type StoredFloor,
} from "../../../domain/ports/carried-floor.repository.js";
import { CarryOverLock } from "../../../domain/ports/carry-over.lock.js";
import { PricingFloorRepository } from "../../../domain/ports/pricing-floor.repository.js";
import { PricingRuleRepository } from "../../../domain/ports/pricing-rule.repository.js";
import { VolumeCommitmentRepository } from "../../../domain/ports/volume-commitment.repository.js";
import { VolumeLadderRepository } from "../../../domain/ports/volume-ladder.repository.js";
import type { Trace, TracingUnitOfWork } from "./mercuriale-amendment.doubles.js";

/*
 * Les doublés des reports de décision (`plan-report-apres-detachement.md`) :
 * le verrou, la relecture et l'écriture disent s'ils ont eu lieu DANS
 * l'unité de travail.
 */

const inTx = (uow: TracingUnitOfWork, what: string): string =>
  `${what} ${uow.open ? "(in tx)" : "(OUTSIDE tx)"}`;

export class TracingLock extends CarryOverLock {
  constructor(
    private readonly trace: Trace,
    private readonly uow: TracingUnitOfWork,
  ) {
    super();
  }
  acquire(family: CarriedFamily, toSku: string): Promise<void> {
    this.trace.push(inTx(this.uow, `lock ${family}:${toSku}`));
    return Promise.resolve();
  }
}

/** Les audiences déjà reportées, par famille. */
export class InMemoryCarried extends CarriedDecisionsReader {
  constructor(
    private readonly trace: Trace,
    private readonly uow: TracingUnitOfWork,
    private readonly carried: Partial<Record<CarriedFamily, readonly string[]>> = {},
  ) {
    super();
  }
  carriedAudiences(family: CarriedFamily): Promise<readonly string[]> {
    this.trace.push(inTx(this.uow, "read carried"));
    return Promise.resolve(this.carried[family] ?? []);
  }
}

export class StoredRules extends PricingRuleRepository {
  readonly saved: { rule: PricingRule; act: PricingAct }[] = [];
  constructor(
    private readonly trace: Trace,
    private readonly uow: TracingUnitOfWork,
    private readonly stored: PricingRule | null,
  ) {
    super();
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  save(rule: PricingRule, act: PricingAct): Promise<void> {
    this.trace.push(inTx(this.uow, "write"));
    this.saved.push({ rule, act });
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  load(): Promise<PricingRule | null> {
    this.trace.push(inTx(this.uow, "load"));
    return Promise.resolve(this.stored);
  }
}

export class StoredLadders extends VolumeLadderRepository {
  readonly posed: { ladder: VolumeLadderAggregate; act: PricingAct }[] = [];
  constructor(private readonly stored: VolumeLadderAggregate | null) {
    super();
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  pose(ladder: VolumeLadderAggregate, act: PricingAct): Promise<void> {
    this.posed.push({ ladder, act });
    return Promise.resolve();
  }
  load(): Promise<VolumeLadderAggregate | null> {
    return Promise.resolve(this.stored);
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
}

export class StoredCommitments extends VolumeCommitmentRepository {
  readonly signed: VolumeCommitmentAggregate[] = [];
  constructor(private readonly stored: VolumeCommitmentAggregate | null) {
    super();
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  sign(commitment: VolumeCommitmentAggregate): Promise<void> {
    this.signed.push(commitment);
    return Promise.resolve();
  }
  load(): Promise<VolumeCommitmentAggregate | null> {
    return Promise.resolve(this.stored);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

export class StoredFloors extends CarriedFloorRepository {
  readonly carried: { floor: PricingFloor; act: PricingAct }[] = [];
  constructor(private readonly stored: StoredFloor | null) {
    super();
  }
  load(): Promise<StoredFloor | null> {
    return Promise.resolve(this.stored);
  }
  carry(floor: PricingFloor, act: PricingAct): Promise<void> {
    this.carried.push({ floor, act });
    return Promise.resolve();
  }
}

/** La limite en vigueur sur la cible — seule lecture que le report lui pose. */
export class FloorsInForce extends PricingFloorRepository {
  constructor(private readonly inForce: PricingFloor | null) {
    super();
  }
  pose(): Promise<void> {
    return Promise.resolve();
  }
  inForceFor(): Promise<PricingFloor | null> {
    return Promise.resolve(this.inForce);
  }
  archive(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** Un catalogue où rien ne se vend au poids : seul `listByShopSkus` est lu. */
export class PieceOnlyCatalog extends CatalogReader {
  listSellable(): Promise<ResolvedCatalogItem[]> {
    return Promise.resolve([]);
  }
  findByShopSku(): Promise<ResolvedCatalogItem | null> {
    return Promise.resolve(null);
  }
  listByShopSkus(): Promise<ReadonlyMap<string, ResolvedCatalogItem>> {
    return Promise.resolve(new Map());
  }
}

export class NamedCompanies extends PricedCompanyNamer {
  nameOf(): Promise<string | null> {
    return Promise.resolve("Hôtel du Lac");
  }
}
