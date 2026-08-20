import { Injectable, Logger } from "@nestjs/common";
import webpush, { WebPushError } from "web-push";

import { AppConfig, type WebPushConfig } from "../../../platform/config/app-config.js";
import type { StaffNotice } from "../domain/ports/staff-notifier.js";
import {
  StaffPushSender,
  type PushOutcome,
  type StaffPushTarget,
} from "../domain/ports/staff-push.js";

/**
 * Les codes que rend un service de push pour un abonnement **définitivement**
 * mort : le navigateur a été réinstallé, la permission retirée, l'appareil
 * effacé. Tout autre code est un incident du jour — un 503, un réseau coupé —
 * et n'autorise pas à désabonner qui que ce soit.
 */
const GONE = new Set([404, 410]);

/**
 * « Ta signature ne vaut pas pour cet abonnement. »
 *
 * Rendu aussi bien par un abonnement né sous une paire VAPID révolue que par
 * TOUS les abonnements quand la paire déployée est la mauvaise. C'est
 * l'appelant qui tranche, avec le temps pour arbitre — cf. `PushOutcome`.
 */
const REJECTED = 403;

/**
 * La charge poussée, telle que le service worker la lira.
 *
 * Elle est **chiffrée de bout en bout** par la bibliothèque (ECDH avec les clés
 * du navigateur) : le service de push transporte sans pouvoir lire. C'est ce qui
 * autorise à y mettre le sujet et le lien plutôt qu'un identifiant à ré-appeler.
 */
interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
}

/**
 * L'envoi Web Push — la norme du W3C, servie par Apple depuis iOS 16.4 et par
 * Android depuis toujours. Le canal natif (APNs) aurait exigé un compte Apple
 * payant pour la seule capacité `Push Notifications`, et une coque à re-signer.
 *
 * Sans paire VAPID, la classe existe mais ne fait rien : `publicKey()` rend
 * `null`, ce que l'écran d'abonnement lit pour dire la vérité plutôt que
 * d'offrir un bouton qui échouerait.
 */
@Injectable()
export class WebPushSender extends StaffPushSender {
  private readonly logger = new Logger(WebPushSender.name);
  private readonly config: WebPushConfig | null;

  constructor(appConfig: AppConfig) {
    super();
    this.config = appConfig.webPushConfig();
  }

  publicKey(): string | null {
    return this.config?.publicKey ?? null;
  }

  async send(targets: readonly StaffPushTarget[], notice: StaffNotice): Promise<PushOutcome> {
    const config = this.config;
    if (config === null) {
      return { gone: [], rejected: [] };
    }
    const payload = JSON.stringify(toPayload(notice));
    const verdicts = await Promise.all(
      targets.map(async (target) => ({
        endpoint: target.endpoint,
        verdict: await this.sendOne(target, payload, config),
      })),
    );
    const pick = (wanted: Verdict): string[] =>
      verdicts.filter((entry) => entry.verdict === wanted).map((entry) => entry.endpoint);

    return { gone: pick("gone"), rejected: pick("rejected") };
  }

  /**
   * @returns ce que le service de push a dit de CET abonnement. `ok` couvre
   *   aussi les échecs temporaires : ils ne doivent désabonner personne, et le
   *   prochain envoi retentera.
   */
  private async sendOne(
    target: StaffPushTarget,
    payload: string,
    config: WebPushConfig,
  ): Promise<Verdict> {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          // Le service de push garde le message quatre heures si l'appareil est
          // hors ligne. Au-delà, une notification d'exploitation est périmée :
          // mieux vaut ne rien afficher que réveiller quelqu'un sur hier.
          TTL: 4 * 60 * 60,
        },
      );
      return "ok";
    } catch (error) {
      if (error instanceof WebPushError) {
        if (GONE.has(error.statusCode)) {
          return "gone";
        }
        if (error.statusCode === REJECTED) {
          return "rejected";
        }
      }
      this.logger.warn({ message: "push_send_failed", endpoint: target.endpoint, error });
      return "ok";
    }
  }
}

/** Ce qu'un service de push a dit d'un abonnement. */
type Verdict = "ok" | "gone" | "rejected";

/** La notice, réduite à ce qu'une bannière système peut montrer. */
function toPayload(notice: StaffNotice): PushPayload {
  return {
    title: notice.subject,
    body: notice.body,
    url: notice.link,
    // Le `tag` fait qu'un même fait remplace sa bannière au lieu d'en empiler
    // une seconde — sur un téléphone laissé de côté, c'est ce qui distingue une
    // pile lisible d'un mur de doublons.
    tag: notice.idempotencyKey,
  };
}
