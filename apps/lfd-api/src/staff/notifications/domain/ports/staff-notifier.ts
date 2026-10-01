import type { StaffNotificationView, StaffPermission } from "@lfd/contracts";

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
  /**
   * **Adressée par droit** (`plan-a-la-porte.md`, B5) : visible et poussée
   * seulement à qui tient ce droit — résolu à la lecture et à l'envoi, jamais
   * figé. Absente : le fil PARTAGÉ, sous `staff_notifications:read`. Une
   * notice d'audience n'entre jamais dans le fil partagé, même pour qui a les
   * deux droits : elle se lit dans « mes notifications ».
   */
  readonly audience?: StaffPermission;
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

/**
 * L'**écriture seule** de la cloche — la moitié de `StaffNotifier` qui persiste.
 *
 * Extraite pour que la poussée vers les téléphones puisse s'y composer sans
 * entrer dans la persistance (SRP), et surtout pour la question à laquelle
 * `notify` ne savait pas répondre : **lesquelles étaient nouvelles ?** Un fait
 * rejoué ne crée aucune ligne, mais aurait tout de même fait vibrer les
 * téléphones — l'anti-doublon de la cloche ne valait que pour l'écran.
 *
 * @returns les notices réellement **créées**, jamais celles écartées en double.
 */
export abstract class StaffNoticeStore {
  abstract save(notices: readonly StaffNotice[]): Promise<readonly StaffNotice[]>;
}

/**
 * Une notification telle que la base la garde : la vue, sans le nom de qui l'a
 * lue — résolu par le handler auprès de l'annuaire (
 * `architecture-journalisation.md` §12, D3).
 */
export type StoredStaffNotification = Omit<StaffNotificationView, "readByName">;

/**
 * La lecture du **fil partagé** — séparée de l'émission (ISP).
 *
 * 🔴 Le mur est dans CHAQUE requête de l'adaptateur, marquage par id compris :
 * seules les notices SANS audience existent ici. Un lecteur du fil ne peut ni
 * voir, ni compter, ni marquer lue — même en connaissant son id — une notice
 * adressée par droit.
 */
export abstract class StaffNotificationReader {
  abstract recent(limit: number): Promise<StoredStaffNotification[]>;
  abstract countUnread(): Promise<number>;
  /** Marquer lu est idempotent : le premier lecteur fait foi. */
  abstract markRead(id: string, staffUserId: string, at: Date): Promise<void>;
  abstract markAllRead(staffUserId: string, at: Date): Promise<number>;
}

/**
 * La lecture de **mes notifications** — celles adressées à un droit que je
 * tiens (`plan-a-la-porte.md`, B5). Un port à part du fil partagé (ISP) : ni
 * le même mur, ni le même lecteur.
 *
 * 🔴 `audiences` est l'effectif de la personne qui appelle, résolu par le
 * guard — jamais une liste reçue du client. Chaque requête porte `audience IN
 * (audiences)` ; une liste vide ne rend rien et ne marque rien. La lecture est
 * commune à l'audience : le premier qui lit fait foi, comme au fil partagé.
 */
export abstract class AudienceNotificationReader {
  abstract recent(
    audiences: readonly StaffPermission[],
    limit: number,
  ): Promise<StoredStaffNotification[]>;
  abstract countUnread(audiences: readonly StaffPermission[]): Promise<number>;
  abstract markRead(
    id: string,
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<void>;
  abstract markAllRead(
    audiences: readonly StaffPermission[],
    staffUserId: string,
    at: Date,
  ): Promise<number>;
}
