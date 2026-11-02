import { Injectable, Logger } from "@nestjs/common";

import {
  DELIVERY_TRANSFER_RECEIVED,
  TransferReceivedFact,
} from "../../../delivery/channels/commerce/index.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../feature-access/application/feature-access-author.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import type { SiteResupply } from "../domain/site-resupply.js";
import { ResupplyNotArrivableError } from "../domain/site-resupply-gate-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { ResupplyArrivedBell } from "./resupply-arrived-bell.js";
import type { ResupplyTrace } from "../domain/resupply-trace.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const MARK_ARRIVED_ON_TRANSFER_RECEIVED = "b2b.resupply-arrived-on-transfer-received";

/**
 * **Le transfert est reçu : ses réassorts sont arrivés** (R3e de
 * `reassort-boutiques/README.md`) — le chemin d'un point
 * servi par transfert (le Village). L'instant et l'auteur sont ceux de la
 * réception du transfert, jamais ceux de la livraison du fait.
 *
 * Abonné DURABLE (`lint:durable-cross-block`) : il tourne dans la transaction
 * qui pose son reçu, et un redémarrage ne perd pas l'arrivée.
 *
 * - **Rejoué**, il ne fait rien de plus : un réassort déjà arrivé, ou déjà
 *   réceptionné, ne change pas et ne sonne pas (`markArrived` rend `false`).
 * - **En course avec « Réceptionner »** (G1, 2026-11-02) : les deux sauvent
 *   le réassort sous sa version, et « Réceptionner » l'avance toujours ; le
 *   second à écrire lève `SiteResupplyChangedMeanwhileError`, le fait est
 *   relivré, et la relecture trouve la réception — rien ne sonne.
 * - **Un réassort introuvable sous ce point, ou qui n'est plus envoyé**
 *   (annulé, ce que le plan figé interdit), est écarté et journalisé : lever
 *   ferait relivrer le fait jusqu'à épuiser ses dix essais
 *   (`MAX_DELIVERY_ATTEMPTS`, vérifié le 2026-11-02), puis le laisserait en
 *   échec, pour une arrivée qui n'a plus d'objet.
 */
@Injectable()
@DurableHandler({
  type: DELIVERY_TRANSFER_RECEIVED,
  subscriber: MARK_ARRIVED_ON_TRANSFER_RECEIVED,
})
export class MarkArrivedOnTransferReceived implements DurableSubscriber {
  private readonly logger = new Logger(MarkArrivedOnTransferReceived.name);

  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly receptions: ResupplyReceptions,
    private readonly labels: ResupplySiteLabels,
    private readonly staff: StaffDirectory,
    private readonly bell: ResupplyArrivedBell,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = TransferReceivedFact.fromPayload(delivery.payload);
    if (fact.resupplyIds.length === 0) {
      return;
    }
    const trace: ResupplyTrace = {
      at: fact.receivedAt,
      author: await authorOf(this.staff, fact.receivedByStaffId),
    };
    const label = (await this.labels.labelsOf([fact.siteId])).get(fact.siteId) ?? null;
    for (const resupplyId of fact.resupplyIds) {
      await this.arrive(fact.siteId, resupplyId, trace, label);
    }
  }

  private async arrive(
    siteId: string,
    resupplyId: string,
    trace: ResupplyTrace,
    label: string | null,
  ): Promise<void> {
    const resupply = await this.resupplies.load(siteId, resupplyId);
    if (resupply === null) {
      this.skip(siteId, resupplyId, "introuvable sous ce point");
      return;
    }
    const reception = await this.receptions.receptionOf(siteId, resupplyId);
    if (!this.arrived(resupply, trace, reception)) {
      return;
    }
    await this.resupplies.save(resupply);
    this.bell.ring(resupply, label, trace.at);
  }

  /**
   * L'agrégat tranche : un réassort qui n'est plus envoyé refuse l'arrivée
   * (`ResupplyNotArrivableError`) ; ce refus-là est écarté et journalisé, au
   * lieu d'être revérifié ici sur le statut.
   */
  private arrived(
    resupply: SiteResupply,
    trace: ResupplyTrace,
    reception: ResupplyTrace | null,
  ): boolean {
    try {
      return resupply.markArrived(trace, reception);
    } catch (error: unknown) {
      if (!(error instanceof ResupplyNotArrivableError)) {
        throw error;
      }
      this.skip(resupply.siteId, resupply.id, "plus envoyé");
      return false;
    }
  }

  private skip(siteId: string, resupplyId: string, why: string): void {
    this.logger.warn(
      `Réassort ${resupplyId} du transfert reçu au point ${siteId} : ${why}, il n'est pas ` +
        `marqué arrivé.`,
    );
  }
}
