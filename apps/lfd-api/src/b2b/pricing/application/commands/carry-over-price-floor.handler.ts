import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { staffViewer } from "../../../catalog/domain/catalog-viewer.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import {
  ensureNotYetCarried,
  type DecisionCarry,
} from "../../domain/entities/decision-carry-over.js";
import { PricingFloor, floorSubjectKey } from "../../domain/entities/pricing-floor.js";
import { describeFloor, describeScope } from "../../domain/pricing-act.js";
import { CarriedDecisionNotFoundError } from "../../domain/pricing-errors.js";
import { CarriedDecisionsReader } from "../../domain/ports/carried-decisions.reader.js";
import { CarriedFloorRepository } from "../../domain/ports/carried-floor.repository.js";
import { CarryOverLock } from "../../domain/ports/carry-over.lock.js";
import { PricingFloorRepository } from "../../domain/ports/pricing-floor.repository.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { referenceCanonicalFor } from "../floor-reference.js";
import { scopeNameOf } from "../scope-names.js";
import { CarryOverPriceFloorCommand } from "./carry-over-price-floor.command.js";
import { assertDetachedFrom } from "./decision-carry-over-support.js";
import { assertOnSale } from "./sale-reference-support.js";

/**
 * **Reporter un plancher** sur la référence née d'un détachement
 * (`plan-report-apres-detachement.md`, § 2.3, R2) — par son chemin propre,
 * pas `SetPriceFloorHandler` : celui-là pose à maintenant, sans fin, et
 * REMPLACE la limite en vigueur. Le report garde la fin de l'ancien, et
 * refuse s'il y a quelque chose à remplacer. Acte `carried`, sur le sujet de
 * la PORTÉE (`floorSubjectKey`), comme toute limite.
 *
 * Sous la surface `lfc_price_limits` : c'est le contrôleur des limites qui
 * l'expose, jamais celui du panneau des décisions (§ 4).
 */
@CommandHandler(CarryOverPriceFloorCommand)
export class CarryOverPriceFloorHandler implements ICommandHandler<
  CarryOverPriceFloorCommand,
  string
> {
  constructor(
    private readonly stored: CarriedFloorRepository,
    private readonly floors: PricingFloorRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
    private readonly carried: CarriedDecisionsReader,
    private readonly lock: CarryOverLock,
    private readonly catalog: ProductCatalogReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Rend l'identifiant du plancher posé.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {CarriedDecisionNotFoundError} aucun plancher de cet identifiant.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle ne se vend pas à cette clientèle.
   * @throws {DecisionAlreadyCarriedError} déjà reporté pour cette clientèle.
   * @throws les refus de `PricingFloor.carriedFrom`, dont `FloorAlreadyInForceError`.
   */
  async execute(command: CarryOverPriceFloorCommand): Promise<string> {
    const carry: DecisionCarry = { fromSku: command.fromSku, toSku: command.toSku };
    await assertDetachedFrom(this.lineage, carry);
    // Lu avant la transaction : le catalogue entier, pour le tarif
    // représentatif de la nouvelle référence — à ne pas tenir sous verrou.
    const articles = await this.catalog.all(staffViewer("pro"));
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      await this.lock.acquire("price_floor", carry.toSku);
      const source = await this.stored.load(command.floorId);
      if (source === null) {
        throw new CarriedDecisionNotFoundError("price_floor", command.floorId);
      }
      const { clientele } = source.floor;
      await assertOnSale(this.references, [carry.toSku], clientele);
      ensureNotYetCarried(
        "price_floor",
        carry,
        clientele,
        await this.carried.carriedAudiences("price_floor", carry.fromSku, carry.toSku, now),
      );
      const target = { type: source.floor.asScopedFloor.scope.type, id: carry.toSku };
      const floor = PricingFloor.carriedFrom(id, source, carry, {
        createdBy: command.staffUserId,
        now,
        referenceCanonicalMillicents: referenceCanonicalFor(target, articles),
        inForceOnTarget: (await this.floors.inForceFor(target, clientele, now)) !== null,
      });
      await this.write(floor, command, now);
    });
    return id;
  }

  /** Le plancher et son acte `carried`, sur le sujet de la PORTÉE — jamais la version. */
  private async write(
    floor: PricingFloor,
    command: CarryOverPriceFloorCommand,
    now: Date,
  ): Promise<void> {
    const { scope, policy } = floor.asScopedFloor;
    await this.stored.carry(floor, {
      subjectType: "floor",
      subjectId: floorSubjectKey(scope, floor.clientele),
      kind: "carried",
      actor: command.staffUserId,
      at: now,
      reason: command.reason.trim(),
      summary: describeFloor(floor.clientele, policy),
      subjectLabel: describeScope(scope, await scopeNameOf(scope, this.catalog)),
    });
  }
}
