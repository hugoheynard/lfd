import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  COLLECTION_NOTICE_QUEUED,
  CollectionNoticeQueuedFact,
} from "../../domain/events/collection-notice-queued.fact.js";
import { CollectionNoticeSender } from "../services/collection-notice-sender.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_COLLECTION_NOTICE = "accounting.send-collection-notice";

/**
 * **L'avis de prélèvement part** — l'abonné durable de la boîte d'envoi
 * (PA2). Le fait est écrit dans la transaction du lot ; le relais le livre
 * après sa validation, et le balayage du cron rattrape un réveil manqué.
 *
 * Comme `MailDeliveryEnRoute` : seul le décodage se fait dans la transaction
 * du reçu ; l'envoi part APRÈS, hors transaction, et son issue s'écrit sur
 * l'avis (`sent` | `failed`) — c'est elle que l'écran lit et que le dépôt
 * exige.
 *
 * ⚠️ Un redémarrage entre la validation du reçu et l'envoi laisse l'avis
 * `queued` : le lot ne se dépose pas, et l'écran le dit. On en sort en
 * annulant le lot et en le préparant de nouveau — un avis jamais parti ne
 * promet rien, la reconstitution en renvoie un.
 */
@Injectable()
@DurableHandler({ type: COLLECTION_NOTICE_QUEUED, subscriber: SEND_COLLECTION_NOTICE })
export class SendCollectionNotice implements DurableSubscriber {
  private readonly logger = new Logger(SendCollectionNotice.name);

  constructor(
    private readonly sender: CollectionNoticeSender,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = CollectionNoticeQueuedFact.fromPayload(delivery.payload);
    this.afterCommit.defer(
      () => this.work.track(this.sendLogged(fact.noticeId), SEND_COLLECTION_NOTICE),
      SEND_COLLECTION_NOTICE,
    );
    return Promise.resolve();
  }

  /** Ne lève jamais : l'issue est écrite sur l'avis, un incident est journalisé. */
  private async sendLogged(noticeId: string): Promise<void> {
    try {
      await this.sender.send(noticeId);
    } catch (cause: unknown) {
      this.logger.error(`Avis de prélèvement ${noticeId} : issue non écrite`, cause);
    }
  }
}
