import type { OpenPackingContainer } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { BinDesk, type DeskBin } from "../../channels/delivery/index.js";
import type { ContainerBin } from "../../domain/entities/order-contents.js";
import { PackingSettings } from "../../domain/entities/packing-settings.js";
import {
  citeContainer,
  PackingContainerOpenedEvent,
} from "../../domain/events/packing-container.events.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";
import { citedOrderOf, lockedSheet } from "./container-support.js";
import { OpenPackingContainerCommand } from "./open-packing-container.command.js";
import { ArrestedPlanHold } from "../../../production/channels/packing/index.js";
import { holdArrestedPlan } from "../arrested-plan-support.js";

/**
 * **Crée un contenant** dans la colonne Contenants (K2b,
 * `colisage/colisage.md` §5–§5.1).
 *
 * Un SAC naît ici. Un BAC naît chez la livraison, par `BinDesk` — déclaré, ou
 * l'autre moitié d'un bac partagé —, avec son code et son QR : ses refus
 * (type archivé, commande hors livraison, tournée partie…) remontent tels
 * quels. L'appel rejoint CETTE unité de travail : si le bac est refusé, ou si
 * le bac du colisage refuse le contenant (fermé, `counted`, plafond), rien
 * n'est écrit — ni bac, ni contenant.
 *
 * L'autre moitié d'un bac partagé n'est ouverte que si Réglages › Colisage
 * l'autorise (fermé par défaut, Hugo, 2026-10-25) — refusé avant que la
 * livraison ne soit appelée.
 *
 * Rend l'identifiant du contenant ; le client relit le poste.
 *
 * **Une fois par intention** : un contenant de plus est un ajout, et un double
 * clic en ouvrirait deux (et déclarerait deux bacs). La clé de l'écran est
 * scellée dans la même unité de travail ; un rejeu rend le même contenant.
 *
 * @throws {HalfSharingDisabledError} @throws {PackingOrderNotDrawnYetError} @throws {PackedOrderSealedError}
 * @throws {ContainersCountedError} @throws {ContainerCeilingReachedError}
 *   et les refus de la livraison pour un bac.
 */
@CommandHandler(OpenPackingContainerCommand)
export class OpenPackingContainerHandler implements ICommandHandler<
  OpenPackingContainerCommand,
  string
> {
  constructor(
    private readonly sheets: PackingSheetRepository,
    private readonly desk: BinDesk,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly settings: PackingSettingsReader,
    private readonly plan: ArrestedPlanHold,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: OpenPackingContainerCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "packing.open",
        subject: command.orderId,
      },
      CREATED_ID_REPLAY,
      (seal) => this.open(command, seal),
    );
  }

  private open(
    command: OpenPackingContainerCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    return this.uow.run(async () => {
      await holdArrestedPlan(this.plan, command.serviceDay);
      const sheet = await lockedSheet(this.sheets, command.serviceDay, command.orderId);
      // Le bac du colisage refuse AVANT qu'un bac ne naisse chez la livraison.
      sheet.assertCanOpenContainer();
      const bin = await this.binFor(command.orderId, command.request);
      const id = this.ids.next();
      sheet.openContainer({
        id,
        nature: bin === null ? "bag" : "bin",
        bin,
        opened: { at: this.clock.now(), by: command.staffUserId },
        voided: null,
        lines: [],
      });
      await this.sheets.save(sheet);
      await this.events.publishTraced(
        new PackingContainerOpenedEvent(
          citedOrderOf(sheet),
          citeContainer(sheet.containerList, id),
          bin === null ? "bag" : "bin",
        ),
      );
      await seal(id);
      return id;
    });
  }

  /** Le bac que la livraison déclare pour ce contenant, ou `null` pour un sac. */
  private async binFor(
    orderId: string,
    request: OpenPackingContainer,
  ): Promise<ContainerBin | null> {
    if (request.nature === "bag") {
      return null;
    }
    const declared = await this.declare(orderId, request);
    return { binId: declared.binId, code: declared.code, half: declared.half };
  }

  /** Une moitié partagée (si le réglage le permet), ou un bac neuf : une seule question. */
  private async declare(
    orderId: string,
    request: Exclude<OpenPackingContainer, { readonly nature: "bag" }>,
  ): Promise<DeskBin> {
    if ("partnerBinId" in request) {
      ((await this.settings.current()) ?? PackingSettings.defaults()).assertCanShareHalf();
      return this.desk.shareHalf({
        orderId,
        partnerBinId: request.partnerBinId,
        innerBags: request.innerBags,
      });
    }
    return this.desk.declareBin({
      orderId,
      binTypeId: request.binTypeId,
      half: request.half,
      innerBags: request.innerBags,
    });
  }
}
