import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CollectionNotice } from "../../domain/entities/collection-notice.js";
import { CollectionNoticeEvent } from "../../domain/events/collection-notice.events.js";
import { CollectionNoticeRepository } from "../../domain/ports/collection-notice.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { noticeMailContent } from "../../domain/services/collection-notice-wording.js";

/** Longueur gardée d'un refus du fournisseur : un témoin, pas une pile. */
const MAX_FAILURE_LENGTH = 500;

/**
 * **Envoie UN avis de prélèvement** et en écrit l'issue (PA2).
 *
 * Hors de toute transaction pendant l'appel au fournisseur : un envoi réseau
 * ne tient pas une connexion du pool (`DurableDeliveryGuard`). L'issue, elle,
 * s'écrit dans SA transaction, par l'agrégat — `queued` → `sent` | `failed`.
 *
 * La clé d'idempotence est l'avis : un second passage sur le même avis ne
 * fait pas partir de second message chez Resend. Un avis qui n'est plus en
 * file (déjà envoyé, en échec) n'est pas renvoyé — un échec se règle en
 * annulant le lot et en le préparant de nouveau.
 *
 * **`sendAndAwaitReceipt`, pas `send`** (plan service d'e-mails, S2d) : l'issue écrite
 * sur l'avis est celle du FOURNISSEUR, et le dépôt du lot exige des avis
 * `sent` (`CollectionBatch.markDeposited`, relu le 2026-11-06) — le préavis
 * SEPA doit être parti avant que la banque prélève. Avec `send`, `sent`
 * voudrait dire « demandé », et un lot se déposerait sur un avis que Resend a
 * refusé. L'appel est déjà hors de toute transaction (exigence de
 * `sendAndAwaitReceipt`) ; le bloc garde la clé et rend le reçu d'un avis déjà parti sans
 * le renvoyer.
 */
@Injectable()
export class CollectionNoticeSender {
  constructor(
    private readonly notices: CollectionNoticeRepository,
    private readonly entities: LegalEntityReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly mail: Mail,
  ) {}

  /** @returns l'état de l'avis après le passage, `null` s'il n'existe pas. */
  async send(noticeId: string): Promise<CollectionNotice["status"] | null> {
    const notice = await this.notices.load(noticeId);
    if (notice === null || !notice.needsSending) {
      return notice?.status ?? null;
    }
    const failure = await this.deliver(notice);
    return this.uow.run(async () => {
      const current = await this.notices.load(noticeId);
      if (current === null || !current.needsSending) {
        return current?.status ?? null;
      }
      const at = this.clock.now();
      if (failure === null) {
        current.markSent(at);
      } else {
        current.markFailed(at, failure);
      }
      await this.notices.save(current);
      const legalEntityId = current.toPersistence().legalEntityId;
      const entity = await this.entities.byId(legalEntityId);
      await this.events.publishTraced(
        new CollectionNoticeEvent(
          current,
          { id: legalEntityId, name: entity?.name ?? legalEntityId },
          at,
        ),
      );
      return current.status;
    });
  }

  /** @returns `null` si le fournisseur a accepté, sinon son refus. */
  private async deliver(notice: CollectionNotice): Promise<string | null> {
    const state = notice.toPersistence();
    const content = noticeMailContent(state);
    if (content === null || state.recipient === null) {
      return "rien à envoyer : avis reconduit ou sans adresse";
    }
    try {
      await this.mail.sendAndAwaitReceipt({
        to: state.recipient.email,
        brand: "lfc",
        template: "customer.collection-notice",
        data: content,
        idempotencyKey: `collection.notice:${state.id}`,
      });
      return null;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return message.slice(0, MAX_FAILURE_LENGTH);
    }
  }
}
