import type { StaffNotice } from "./staff-notifier.js";

/** Un abonnement de navigateur, réduit à ce qu'il faut pour lui écrire. */
export interface StaffPushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Le **registre des installations abonnées**.
 *
 * Séparé de l'envoi (ISP) : l'écran qui abonne n'a rien à savoir du chiffrement,
 * et l'émetteur n'a rien à savoir de la persistance.
 */
export abstract class StaffPushSubscriptions {
  /** Idempotent par `endpoint` : un navigateur qui se réabonne remplace. */
  abstract save(target: StaffPushTarget, staffSub: string): Promise<void>;
  abstract forget(endpoint: string): Promise<void>;
  abstract all(): Promise<readonly StaffPushTarget[]>;
  /**
   * Marque les envois acceptés — et **efface** la marque de refus : un
   * abonnement qui repasse est un abonnement guéri, pas un sursis.
   */
  abstract markSent(endpoints: readonly string[], at: Date): Promise<void>;
  /** Note le début d'un refus. Ne touche pas ceux qui refusaient déjà. */
  abstract markFailing(endpoints: readonly string[], since: Date): Promise<void>;
  /** Oublie ce qui refuse depuis plus longtemps que le délai de grâce. */
  abstract forgetFailingSince(before: Date): Promise<number>;
}

/**
 * Ce qu'un envoi apprend sur les abonnements visés.
 *
 * Deux catégories, parce que les services de push distinguent deux refus qui
 * n'appellent pas la même conduite. Tout le reste — 5xx, réseau coupé,
 * temporisation — ne figure NULLE PART : oublier sur un incident du jour
 * désabonnerait toute l'équipe le matin où le service de push tousse.
 */
export interface PushOutcome {
  /**
   * **Disparus** (404/410) : le navigateur a été réinstallé, la permission
   * retirée, l'appareil effacé. Le service de push est formel, on oublie.
   */
  readonly gone: readonly string[];
  /**
   * **Refusés** (403) : notre signature ne vaut pas pour cet abonnement.
   *
   * Ambigu, et dangereux à lire trop vite : c'est le code que rend un
   * abonnement né sous une paire VAPID révolue — mais aussi celui que rendent
   * TOUS les abonnements si la paire déployée est la mauvaise. On note, on
   * n'oublie pas ici.
   */
  readonly rejected: readonly string[];
}

/**
 * Le **transport** vers un service de push.
 *
 * `send` ne rejette pas : un abonnement mort est un fait ordinaire — un
 * téléphone effacé, un navigateur réinstallé — et non une panne de l'émission.
 */
export abstract class StaffPushSender {
  abstract send(targets: readonly StaffPushTarget[], notice: StaffNotice): Promise<PushOutcome>;
  /** La clé publique à donner au navigateur, ou `null` si non configuré. */
  abstract publicKey(): string | null;
}
