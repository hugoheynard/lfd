import { Injectable, Logger } from "@nestjs/common";

import { BackgroundWork } from "../../../platform/events/background-work.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  StaffNoticeStore,
  StaffNotifier,
  type StaffNotice,
} from "../domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  StaffPushSubscriptions,
  type StaffPushTarget,
} from "../domain/ports/staff-push.js";

/**
 * Combien de temps un abonnement peut se faire **refuser** avant d'être oublié.
 *
 * Ce délai n'existe que parce que le 403 est ambigu : il dit la même chose d'un
 * abonnement orphelin d'une vraie rotation de clés — qui ne guérira jamais — et
 * de TOUS les abonnements quand la paire déployée est la mauvaise, ce qui se
 * répare en quelques heures. Le temps est le seul arbitre qui les sépare.
 *
 * Une semaine : assez long pour couvrir un mauvais réglage posé un vendredi et
 * corrigé le lundi, assez court pour que la table ne garde pas des orphelins
 * qui échouent à chaque envoi.
 */
const REJECTION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * La cloche, **plus** la vibration du téléphone.
 *
 * Décorateur et non fusion : l'écriture reste ignorante du transport, et le jour
 * où un second canal s'ajoute (un webhook Slack, disons), il se compose ici sans
 * toucher à la persistance.
 *
 * Trois garanties tiennent tout :
 *
 * 1. **On ne pousse que du nouveau.** `save` rend les notices réellement créées ;
 *    un fait rejoué n'en produit aucune, donc aucun téléphone ne vibre. Sans
 *    cela, l'anti-doublon de la cloche n'aurait valu que pour l'écran.
 * 2. **La poussée ne fait jamais attendre ni échouer l'émission.** Elle part en
 *    travail de FOND : ni la requête qui a provoqué le fait, ni son émetteur
 *    n'attendent que trois services de push aient répondu. Un service
 *    injoignable, un abonnement mort — le fait est enregistré, l'écran
 *    l'affiche, et le téléphone reste muet. L'inverse, perdre la notification
 *    parce qu'un téléphone est éteint, serait absurde ; la faire attendre par
 *    un commercial au téléphone le serait presque autant.
 * 3. **Un refus ne désabonne pas tout de suite.** Cf. {@link REJECTION_GRACE_MS} :
 *    une paire VAPID mal posée refuse exactement comme un abonnement périmé, et
 *    oublier au premier 403 viderait la table sur une erreur de configuration —
 *    chaque téléphone devrait réactiver à la main, sans que personne comprenne.
 */
@Injectable()
export class PushingStaffNotifier extends StaffNotifier {
  private readonly logger = new Logger(PushingStaffNotifier.name);

  constructor(
    private readonly store: StaffNoticeStore,
    private readonly subscriptions: StaffPushSubscriptions,
    private readonly sender: StaffPushSender,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {
    super();
  }

  /**
   * L'écriture est attendue — c'est elle qui fait exister le fait. La poussée,
   * non : elle est **suivie** plutôt qu'attendue.
   *
   * `track` porte les deux choses qui manquaient à un `void promise` nu : il
   * avale l'échec après l'avoir journalisé (sans lui, un service de push
   * injoignable devient un `unhandledRejection`), et il donne aux tests le
   * `whenIdle()` sans lequel ils videraient la base pendant qu'un envoi est
   * encore en vol.
   */
  async notify(notices: readonly StaffNotice[]): Promise<void> {
    const created = await this.store.save(notices);
    if (created.length === 0 || this.sender.publicKey() === null) {
      return;
    }
    void this.work.track(this.push(created), "push-staff-notifications");
  }

  private async push(notices: readonly StaffNotice[]): Promise<void> {
    const targets = await this.subscriptions.all();
    if (targets.length === 0) {
      return;
    }
    const at = this.clock.now();
    for (const notice of notices) {
      await this.pushOne(targets, notice, at);
    }
    await this.expireRejected(at);
  }

  private async pushOne(
    targets: readonly StaffPushTarget[],
    notice: StaffNotice,
    at: Date,
  ): Promise<void> {
    const { gone, rejected } = await this.sender.send(targets, notice);

    if (rejected.length === targets.length && rejected.length > 0) {
      // TOUS refusent : ce n'est pas la flotte de téléphones qui a changé, c'est
      // nous. Dit en `error` et non en `warn` — c'est un réglage à réparer, et
      // le délai de grâce n'a qu'une semaine d'avance sur lui.
      this.logger.error({
        message: "push_all_rejected",
        hint: "la paire VAPID déployée ne correspond probablement pas à celle des abonnements",
        count: rejected.length,
      });
    }

    const accepted = targets
      .map((target) => target.endpoint)
      .filter((endpoint) => !gone.includes(endpoint) && !rejected.includes(endpoint));

    await this.subscriptions.markSent(accepted, at);
    await this.subscriptions.markFailing(rejected, at);
    for (const endpoint of gone) {
      await this.subscriptions.forget(endpoint);
    }
  }

  /** Oublie ce qui refuse depuis plus longtemps que le délai de grâce. */
  private async expireRejected(at: Date): Promise<void> {
    const forgotten = await this.subscriptions.forgetFailingSince(
      new Date(at.getTime() - REJECTION_GRACE_MS),
    );
    if (forgotten > 0) {
      this.logger.warn({ message: "push_subscriptions_expired", count: forgotten });
    }
  }
}
