import type { StaffNotificationView } from "@lfd/contracts";

/** Un fait à annoncer à l'équipe. Tout y est **déjà figé**, prêt à afficher. */
export interface StaffNotice {
  /** Nature du fait, ex. `alert.account`. */
  readonly kind: string;
  readonly subject: string;
  /** Une ligne, pas un rapport. */
  readonly body: string;
  /** Route interne à ouvrir. */
  readonly link: string;
  /** Anti-doublon : un fait rejoué ne sonne pas deux fois. */
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
}

/**
 * La **cloche du back-office**, vue par ceux qui la font sonner.
 *
 * Port volontairement pauvre : un émetteur n'a rien à savoir de la lecture, du
 * comptage ni du marquage. C'est ce qui permet aux alertes, aux rendez-vous et
 * aux demandes de contact d'en dépendre sans se connaître.
 */
export abstract class StaffNotifier {
  abstract notify(notices: readonly StaffNotice[]): Promise<void>;
}

/** La lecture de la cloche — séparée de l'émission (ISP). */
export abstract class StaffNotificationReader {
  abstract recent(limit: number): Promise<StaffNotificationView[]>;
  abstract countUnread(): Promise<number>;
  /** Marquer lu est idempotent : le premier lecteur fait foi. */
  abstract markRead(id: string, staffSub: string, at: Date): Promise<void>;
  abstract markAllRead(staffSub: string, at: Date): Promise<number>;
}
