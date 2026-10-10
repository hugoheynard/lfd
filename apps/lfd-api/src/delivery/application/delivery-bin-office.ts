import { Injectable } from "@nestjs/common";

import type { BinShareRequest } from "../../packing/channels/delivery/index.js";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../platform/id/id-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../channels/commerce/index.js";
import { DeliveryBin } from "../domain/entities/delivery-bin.js";
import {
  DeliveryBinSharedEvent,
  DeliveryBinVoidedEvent,
  DeliveryBinsDeclaredEvent,
} from "../domain/events/delivery-loading.events.js";
import { BinCodeDrawer } from "../domain/ports/bin-code-drawer.js";
import { BinTypeLookup } from "../domain/ports/bin-type-lookup.js";
import { DeliveryBinRepository } from "../domain/ports/delivery-bin.repository.js";
import { StopLoadingRepository } from "../domain/ports/stop-loading.repository.js";
import { BinDeclaration } from "../domain/value-objects/bin-declaration.js";
import {
  citedOrderOf,
  declarableReference,
  drawBinCode,
  drawBinCodes,
  loadBin,
  lookUpBinType,
} from "./delivery-loading-support.js";

/** Une déclaration : `whole` bacs entiers d'un type, et au besoin une moitié. */
export interface BinsDeclaration {
  readonly orderId: string;
  readonly binTypeId: string;
  readonly whole: number;
  readonly half: boolean;
  readonly innerBags: number;
}

/**
 * **Le guichet des bacs de la livraison** — déclarer, annuler, partager, avec
 * leurs refus et leur fait au journal. Sorti des trois handlers le 2026-10-04
 * (K2b, `colisage/colisage.md` §5–§5.1). Depuis le retrait des routes de
 * déclaration et de partage de la livraison (2026-10-10, §9, voie (b)), il
 * sert `BinDesk`, que le colisage appelle dans sa propre transaction, et
 * l'annulation par la route de la livraison (qui refuse d'abord une commande
 * gérée au colisage).
 *
 * Chaque geste ouvre son unité de travail, qui rejoint celle de l'appelant
 * quand elle existe (`UnitOfWork.run`).
 */
@Injectable()
export class DeliveryBinOffice {
  constructor(
    private readonly bins: DeliveryBinRepository,
    private readonly binTypes: BinTypeLookup,
    private readonly loadings: StopLoadingRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly drawer: BinCodeDrawer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Déclare des bacs d'un type (lot 4, L4-C16 ; lot 4 bis, tranche B) :
   * `whole` bacs entiers, et au besoin une moitié — la gauche d'un bac
   * physique neuf. La déclaration est validée ENTIÈRE (type en service,
   * cloison, bornes) avant qu'aucun code ne se tire. La commande doit exister,
   * être en livraison et non annulée ; si elle est déjà dans une tournée,
   * celle-ci est verrouillée en partage : une tournée partie ne reçoit plus de
   * bac. UN fait au journal.
   *
   * @throws {BinTypeNotFoundError} @throws {BinTypeArchivedForDeclarationError}
   * @throws {BinTypeNotDivisibleError} @throws {InvalidBinDeclarationCountError}
   * @throws {InvalidInnerBagsError} @throws {BinsNotDeclarableError}
   * @throws {DeliveryRoundDepartedError} @throws {BinCodeExhaustedError}
   * @throws {BinCodeCollisionError}
   */
  async declare(payload: BinsDeclaration): Promise<readonly DeliveryBin[]> {
    const { orderId, binTypeId, whole, half, innerBags } = payload;
    return this.uow.run(async () => {
      const binType = await lookUpBinType(this.binTypes, binTypeId);
      const declaration = BinDeclaration.of({ binType, whole, half, innerBags });
      const reference = await declarableReference(this.orders, orderId);
      const loading = await this.loadings.forOrder(orderId);
      const codes = await drawBinCodes(this.drawer, this.bins, declaration.count);
      const bins = DeliveryBin.declare({
        orderId,
        declaration,
        identities: codes.map((code) => ({ id: this.ids.next(), code })),
        physicalBinId: this.ids.next(),
        at: this.clock.now(),
        loading,
      });
      await this.bins.declare(bins);
      await this.events.publishTraced(
        new DeliveryBinsDeclaredEvent(
          { id: orderId, name: reference },
          { id: binType.id, name: binType.name },
          declaration.innerBags,
          bins,
        ),
      );
      return bins;
    });
  }

  /**
   * Annule l'étiquette d'un bac de trop (lot 4, L4-C19) — refusé s'il est
   * chargé (décharger d'abord) ou si sa tournée est partie. Annuler un bac
   * déjà annulé n'écrit rien.
   *
   * @throws {DeliveryBinNotFoundError} @throws {BinLoadedError}
   * @throws {DeliveryRoundDepartedError} @throws {DeliveryLoadingStaleError}
   */
  async void(binId: string): Promise<void> {
    await this.uow.run(async () => {
      const found = await loadBin(this.bins, binId);
      const loading = await this.loadings.forOrder(found.orderId, found.id);
      // Relu SOUS le verrou : un chargement ou une annulation concurrents sont
      // passés, et on voit ce qu'ils ont écrit.
      const bin = await loadBin(this.bins, found.id);
      if (!bin.void(this.clock.now(), loading)) {
        return;
      }
      await this.bins.save(bin);
      await this.events.publishTraced(
        new DeliveryBinVoidedEvent(bin, await citedOrderOf(this.orders, bin.orderId)),
      );
    });
  }

  /**
   * Partage un bac (lot 4 bis, v2-4 — dernier recours) : l'AUTRE moitié d'un
   * bac cloisonné dont une moitié est déjà à une autre commande. Refusé si les
   * deux commandes ne sont pas dans la même tournée au dépôt, à des arrêts
   * CONSÉCUTIFS. La moitié partenaire est verrouillée APRÈS la tournée puis
   * RELUE : un partage, une annulation ou un chargement concurrents se
   * sérialisent.
   *
   * @throws {DeliveryBinNotFoundError} @throws {BinNotShareableError}
   * @throws {BinHalfTakenError} @throws {SharedBinNotAdjacentError}
   * @throws {BinTypeArchivedForDeclarationError} @throws {InvalidInnerBagsError}
   * @throws {BinsNotDeclarableError} @throws {DeliveryRoundDepartedError}
   * @throws {DeliveryLoadingStaleError} @throws {BinHalfRaceError}
   */
  async share(payload: BinShareRequest): Promise<DeliveryBin> {
    const { orderId, partnerBinId, innerBags } = payload;
    return this.uow.run(async () => {
      const reference = await declarableReference(this.orders, orderId);
      const loading = await this.loadings.forOrder(orderId, partnerBinId);
      // Relue SOUS le verrou : une annulation ou un partage concurrents sont passés.
      const partner = await loadBin(this.bins, partnerBinId);
      const partnerOrder = await citedOrderOf(this.orders, partner.orderId);
      const binType = await lookUpBinType(this.binTypes, partner.binTypeId);
      const code = await drawBinCode(this.drawer, this.bins);
      const bin = DeliveryBin.shareHalf({
        orderId,
        partner,
        liveHalves:
          partner.physicalBinId === null ? [] : await this.bins.liveHalvesOf(partner.physicalBinId),
        binType,
        identity: { id: this.ids.next(), code },
        innerBags,
        names: {
          reference,
          partnerReference: typeof partnerOrder === "string" ? partnerOrder : partnerOrder.name,
        },
        at: this.clock.now(),
        loading,
      });
      await this.bins.declare([bin]);
      await this.events.publishTraced(
        new DeliveryBinSharedEvent(
          { id: orderId, name: reference },
          { id: binType.id, name: binType.name },
          bin,
          partner,
          partnerOrder,
        ),
      );
      return bin;
    });
  }

  /**
   * Les bacs vivants de cette commande sont-ils encore à portée de main ? Une
   * vérification sans écriture, pour le colisage qui rouvre une commande
   * (`colisage/colisage.md`, §17.2, option b). La tournée est
   * verrouillée en partage jusqu'à la fin de l'unité de travail de l'appelant :
   * un « Partir » concurrent attend.
   *
   * @throws {BinLoadedError} @throws {DeliveryRoundDepartedError}
   * @throws {DeliveryLoadingStaleError}
   */
  async assertAtHand(orderId: string, binIds: readonly string[]): Promise<void> {
    await this.uow.run(async () => {
      const loading = await this.loadings.forOrder(orderId);
      for (const binId of new Set(binIds)) {
        const bin = await this.bins.load(binId);
        if (bin !== null && bin.voidedAt === null) {
          bin.ensureAtHand(loading);
        }
      }
    });
  }

  /** La commande de ce bac, ou `null` s'il n'existe pas. */
  async orderOf(binId: string): Promise<string | null> {
    return (await this.bins.load(binId))?.orderId ?? null;
  }

  /** Ceux de ces bacs qui existent et ne sont pas annulés. */
  async liveAmong(binIds: readonly string[]): Promise<ReadonlySet<string>> {
    const live = new Set<string>();
    for (const binId of new Set(binIds)) {
      const bin = await this.bins.load(binId);
      if (bin !== null && bin.voidedAt === null) {
        live.add(binId);
      }
    }
    return live;
  }
}
