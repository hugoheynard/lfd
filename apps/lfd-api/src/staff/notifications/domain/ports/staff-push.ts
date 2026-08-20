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
  /** Marque les envois acceptés — un abonnement muet est un appareil remplacé. */
  abstract markSent(endpoints: readonly string[], at: Date): Promise<void>;
}

/**
 * Le **transport** vers un service de push.
 *
 * `send` ne rejette pas : un abonnement mort est un fait ordinaire — un
 * téléphone effacé, un navigateur réinstallé — et non une panne de l'émission.
 *
 * @returns les endpoints **définitivement** morts (404/410), à oublier. Un
 *   échec temporaire n'y figure pas : oublier sur une erreur réseau
 *   désabonnerait toute l'équipe le jour où le service de push tousse.
 */
export abstract class StaffPushSender {
  abstract send(
    targets: readonly StaffPushTarget[],
    notice: StaffNotice,
  ): Promise<readonly string[]>;
  /** La clé publique à donner au navigateur, ou `null` si non configuré. */
  abstract publicKey(): string | null;
}
