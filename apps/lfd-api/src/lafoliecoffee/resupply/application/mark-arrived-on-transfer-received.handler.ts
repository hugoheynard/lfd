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
import type { SiteResupply } from "../domain/site-resupply.js";
import { ResupplyNotArrivableError } from "../domain/site-resupply-gate-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { ResupplyArrival } from "./resupply-arrival.js";
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
    private readonly arrival: ResupplyArrival,
    private readonly staff: StaffDirectory,
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
    // Une lecture pour tout le transfert, comme le départ (M6) ; chaque
    // réassort se sauve ensuite sous SA version.
    const found = await this.resupplies.loadMany(fact.siteId, fact.resupplyIds);
    const arrived: SiteResupply[] = [];
    for (const resupplyId of fact.resupplyIds) {
      const resupply = found.find((candidate) => candidate.id === resupplyId);
      if (resupply === undefined) {
        this.skip(fact.siteId, resupplyId, "introuvable sous ce point");
      } else if (
        await this.arrival.mark(resupply, (reception) => this.arrived(resupply, trace, reception))
      ) {
        arrived.push(resupply);
      }
    }
    await this.arrival.ring(fact.siteId, arrived, trace.at);
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
