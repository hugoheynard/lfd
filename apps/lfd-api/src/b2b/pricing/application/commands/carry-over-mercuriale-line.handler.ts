import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import {
  CarriedMercurialeNotFoundError,
  NotDetachedFromError,
} from "../../domain/pricing-errors.js";
import { CarryOverMercurialeLineCommand } from "./carry-over-mercuriale-line.command.js";
import { describeCarryOver } from "./company-mercuriale-support.js";
import { assertOnSale } from "./sale-reference-support.js";

@CommandHandler(CarryOverMercurialeLineCommand)
export class CarryOverMercurialeLineHandler implements ICommandHandler<
  CarryOverMercurialeLineCommand,
  string
> {
  constructor(
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Rend l'identifiant de l'avenant écrit.
   *
   * La garde est la FILIATION : la nouvelle référence doit être née de
   * l'ancienne (`detached_from_sku`). Sans elle, « reporter » poserait un prix
   * sur n'importe quel article sans aucun des contrôles d'une saisie. Puis la
   * vente aux pros (L5), comme toute ligne ouverte par un avenant.
   *
   * Verrou, relecture et avenant dans la MÊME transaction, comme
   * `AmendCompanyMercurialeHandler` (seconde contradiction, B2) : deux
   * reports simultanés ne passent pas tous les deux.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle référence ne se vend pas aux pros.
   * @throws {CarriedMercurialeNotFoundError} aucune mercuriale de cet identifiant.
   * @throws les refus de `CompanyMercuriale.carryOver`.
   */
  async execute(command: CarryOverMercurialeLineCommand): Promise<string> {
    const { mercurialeId, fromSku, toSku, reason, staffUserId } = command;
    const origin = await this.lineage.detachedFromOf(toSku);
    if (origin !== fromSku) {
      throw new NotDetachedFromError(toSku, fromSku, origin);
    }
    await assertOnSale(this.references, [toSku], "pro");
    const now = this.clock.now();
    const amendmentId = this.ids.next();

    await this.uow.run(async () => {
      const mercuriale = await this.mercuriales.lockForAmendment(mercurialeId);
      if (mercuriale === null) {
        throw new CarriedMercurialeNotFoundError(mercurialeId);
      }
      const carried = mercuriale.carryOver(
        amendmentId,
        { fromSku, toSku, reason },
        staffUserId,
        now,
      );
      const amendment = carried.amendments.find((candidate) => candidate.id === amendmentId);
      await this.mercuriales.addAmendment(carried, amendmentId, {
        subjectType: "mercuriale",
        subjectId: carried.id,
        kind: "amended",
        actor: staffUserId,
        // Daté de la prise d'effet, comme la pose et l'avenant saisi.
        at: amendment?.validFrom ?? now,
        reason: reason.trim(),
        summary: describeCarryOver(carried, fromSku, toSku, amendment?.validFrom ?? now),
        subjectLabel: carried.label,
      });
    });
    return amendmentId;
  }
}
