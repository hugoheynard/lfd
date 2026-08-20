import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  StaffNoticeStore,
  StaffNotifier,
  type StaffNotice,
} from "../domain/ports/staff-notifier.js";
import { StaffPushSender, StaffPushSubscriptions } from "../domain/ports/staff-push.js";

/**
 * La cloche, **plus** la vibration du téléphone.
 *
 * Décorateur et non fusion : l'écriture reste ignorante du transport, et le jour
 * où un second canal s'ajoute (un webhook Slack, disons), il se compose ici sans
 * toucher à la persistance.
 *
 * Deux garanties tiennent tout :
 *
 * 1. **On ne pousse que du nouveau.** `save` rend les notices réellement créées ;
 *    un fait rejoué n'en produit aucune, donc aucun téléphone ne vibre. Sans
 *    cela, l'anti-doublon de la cloche n'aurait valu que pour l'écran.
 * 2. **La poussée ne fait jamais échouer l'émission.** Un service de push
 *    injoignable, un abonnement mort : le fait est enregistré, l'écran l'affiche,
 *    et le téléphone reste muet. L'inverse — perdre la notification parce qu'un
 *    téléphone est éteint — serait absurde.
 */
@Injectable()
export class PushingStaffNotifier extends StaffNotifier {
  private readonly logger = new Logger(PushingStaffNotifier.name);

  constructor(
    private readonly store: StaffNoticeStore,
    private readonly subscriptions: StaffPushSubscriptions,
    private readonly sender: StaffPushSender,
    private readonly clock: Clock,
  ) {
    super();
  }

  async notify(notices: readonly StaffNotice[]): Promise<void> {
    const created = await this.store.save(notices);
    if (created.length === 0 || this.sender.publicKey() === null) {
      return;
    }
    try {
      await this.push(created);
    } catch (error) {
      // Journalisé, pas propagé : cf. la garantie 2 ci-dessus.
      this.logger.warn({ message: "push_notification_failed", error });
    }
  }

  private async push(notices: readonly StaffNotice[]): Promise<void> {
    const targets = await this.subscriptions.all();
    if (targets.length === 0) {
      return;
    }
    const sentAt = this.clock.now();
    for (const notice of notices) {
      const dead = await this.sender.send(targets, notice);
      await this.subscriptions.markSent(
        targets.map((target) => target.endpoint).filter((endpoint) => !dead.includes(endpoint)),
        sentAt,
      );
      for (const endpoint of dead) {
        await this.subscriptions.forget(endpoint);
      }
    }
  }
}
