import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryBin } from "../../domain/entities/delivery-bin.js";
import { InternalTransferNotFoundError } from "../../domain/errors/internal-transfer-errors.js";
import { InternalTransferBinsDeclaredEvent } from "../../domain/events/internal-transfer.events.js";
import { BinCodeDrawer } from "../../domain/ports/bin-code-drawer.js";
import { BinTypeLookup } from "../../domain/ports/bin-type-lookup.js";
import { DeliveryBinRepository } from "../../domain/ports/delivery-bin.repository.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { BinDeclaration } from "../../domain/value-objects/bin-declaration.js";
import { drawBinCodes, lookUpBinType } from "../delivery-loading-support.js";
import { DeclareTransferBinsCommand } from "./declare-transfer-bins.command.js";

/**
 * **Déclarer les bacs d'un transfert interne** (plan du transfert interne,
 * Q-T4 révisée par Hugo le 2026-10-13, lot T3) — au chargement.
 *
 * Les commandes d'un site servi par transfert se mettent en SACS au
 * colisage ; les sacs vont dans autant de bacs que nécessaire, et ces bacs
 * appartiennent au TRANSFERT. C'est le bac existant — même code court tiré,
 * même QR, même chargement, même « Partir » — avec un sujet de plus.
 *
 * Dans UNE unité de travail : le chargement de l'arrêt du transfert d'abord
 * (sa tournée verrouillée en partage, comme pour un bac de commande — un
 * « Partir » concurrent attend), puis le transfert, qui doit être PRÉVU ; la
 * déclaration est validée entière avant qu'aucun code ne se tire. Un
 * transfert encore dans aucune tournée reçoit ses bacs quand même : ils
 * attendent son placement, comme ceux d'une commande pas encore répartie.
 * Rend les identifiants des bacs : l'écran imprime leurs étiquettes.
 */
@CommandHandler(DeclareTransferBinsCommand)
export class DeclareTransferBinsHandler implements ICommandHandler<
  DeclareTransferBinsCommand,
  readonly string[]
> {
  constructor(
    private readonly transfers: InternalTransfersReader,
    private readonly bins: DeliveryBinRepository,
    private readonly binTypes: BinTypeLookup,
    private readonly loadings: StopLoadingRepository,
    private readonly drawer: BinCodeDrawer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @returns les identifiants des bacs déclarés, dans l'ordre.
   * @throws {InternalTransferNotFoundError} @throws {TransferBinsClosedError}
   * @throws {BinTypeNotFoundError} @throws {BinTypeArchivedForDeclarationError}
   * @throws {InvalidBinDeclarationCountError} @throws {InvalidInnerBagsError}
   * @throws {DeliveryRoundDepartedError} @throws {BinCodeExhaustedError}
   * @throws {BinCodeCollisionError} @throws {DeliveryLoadingStaleError}
   */
  async execute(request: DeclareTransferBinsCommand): Promise<readonly string[]> {
    return this.uow.run(async () => {
      const loading = await this.loadings.forTransfer(request.transferId);
      const transfer = await this.transfers.byId(request.transferId);
      if (transfer === null) {
        throw new InternalTransferNotFoundError(request.transferId);
      }
      transfer.ensureTakesBins();
      const binType = await lookUpBinType(this.binTypes, request.binTypeId);
      const declaration = BinDeclaration.of({
        binType,
        whole: request.count,
        half: false,
        innerBags: request.innerBags,
      });
      const codes = await drawBinCodes(this.drawer, this.bins, declaration.count);
      const bins = DeliveryBin.declare({
        subject: { kind: "transfer", transferId: transfer.id },
        declaration,
        identities: codes.map((code) => ({ id: this.ids.next(), code })),
        physicalBinId: this.ids.next(),
        at: this.clock.now(),
        loading,
      });
      await this.bins.declare(bins);
      await this.events.publishTraced(
        new InternalTransferBinsDeclaredEvent(
          transfer,
          { id: binType.id, name: binType.name },
          declaration.innerBags,
          bins,
        ),
      );
      return bins.map((bin) => bin.id);
    });
  }
}
