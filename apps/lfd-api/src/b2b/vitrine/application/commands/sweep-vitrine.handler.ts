import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineDeliveryRepository } from "../../domain/ports/vitrine-delivery.repository.js";
import { VitrineFingerprintStore } from "../../domain/ports/vitrine-fingerprint.store.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import {
  compareVitrinePrints,
  vitrineKindsFor,
  vitrinePrintsFor,
  type VitrineShowcase,
} from "../../domain/services/vitrine-fingerprints.js";
import { VitrineDelivery } from "../../domain/vitrine-delivery.js";
import type { VitrineSubscriber } from "../../domain/vitrine-subscriber.js";
import { VitrineRelay } from "../services/vitrine-relay.js";
import { VitrineShowcaseLoader } from "../services/vitrine-showcase.loader.js";
import { SweepVitrineCommand, type VitrineSweepReport } from "./sweep-vitrine.command.js";

/** Les essais d'un passage : cinq secondes au plus chacun, le cron repasse dans cinq minutes. */
export const VITRINE_RELAY_BATCH = 20;

const NOTHING: VitrineSweepReport = { subscribers: 0, notified: 0, attempted: 0, delivered: 0 };

/**
 * **Le balayage de la vitrine** (W3′, B3, S3), au cron `*\/5` du Worker.
 *
 * 1. Les abonnés livrables ; AUCUN → rien n'est calculé, rien ne part.
 * 2. La vue publique et les textes, UNE fois par langue servie.
 * 3. Par abonné, dans son unité : sa vue filtrée comparée à la dernière
 *    empreinte ÉMISE ; un changement ouvre une livraison — ou complète celle
 *    qui attend encore (une seule en vol) — et les empreintes avancent.
 * 4. Les livraisons dues partent, signées ; épuisées, l'abonné passe en échec.
 *
 * @sans-journal un balayage technique ; ses effets se lisent au journal des
 * envois de l'écran.
 */
@CommandHandler(SweepVitrineCommand)
export class SweepVitrineHandler implements ICommandHandler<
  SweepVitrineCommand,
  VitrineSweepReport
> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly deliveries: VitrineDeliveryRepository,
    private readonly prints: VitrineFingerprintStore,
    private readonly showcase: VitrineShowcaseLoader,
    private readonly relay: VitrineRelay,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<VitrineSweepReport> {
    const subscribers = await this.subscribers.listDeliverable();
    if (subscribers.length === 0) {
      return NOTHING;
    }
    const showcase = await this.showcase.load();
    let notified = 0;
    for (const subscriber of subscribers) {
      if (await this.compare(subscriber, showcase)) {
        notified += 1;
      }
    }
    const relayed = await this.relayDue(subscribers);
    return { subscribers: subscribers.length, notified, ...relayed };
  }

  private compare(subscriber: VitrineSubscriber, showcase: VitrineShowcase): Promise<boolean> {
    return this.uow.run(async () => {
      const now = this.clock.now();
      const { changes, upserts, removals } = compareVitrinePrints(
        await this.prints.load(subscriber.id),
        vitrinePrintsFor(showcase, subscriber.contents),
        vitrineKindsFor(subscriber.contents),
      );
      if (changes.isEmpty) {
        return false;
      }
      const pending = await this.deliveries.pendingChangeOf(subscriber.id);
      if (pending !== null) {
        pending.absorb(changes, now);
        await this.deliveries.save(pending);
      } else {
        const sequence = subscriber.takeSequence(now);
        await this.subscribers.save(subscriber);
        await this.deliveries.save(
          VitrineDelivery.prepare({
            id: this.ids.next(),
            subscriberId: subscriber.id,
            sequence,
            changes,
            at: now,
          }),
        );
      }
      await this.prints.record(subscriber.id, upserts, removals, now);
      return true;
    });
  }

  private async relayDue(
    subscribers: readonly VitrineSubscriber[],
  ): Promise<Pick<VitrineSweepReport, "attempted" | "delivered">> {
    const byId = new Map(subscribers.map((subscriber) => [subscriber.id, subscriber]));
    const due = await this.deliveries.listDue(this.clock.now(), VITRINE_RELAY_BATCH);
    let attempted = 0;
    let delivered = 0;
    for (const delivery of due) {
      const subscriber = byId.get(delivery.subscriberId);
      if (subscriber === undefined || !subscriber.isDeliverable) {
        continue;
      }
      await this.relay.attempt(delivery, subscriber);
      attempted += 1;
      delivered += delivery.isPending || delivery.isFailed ? 0 : 1;
      await this.uow.run(async () => {
        await this.deliveries.save(delivery);
        await this.subscribers.save(subscriber);
      });
    }
    return { attempted, delivered };
  }
}
