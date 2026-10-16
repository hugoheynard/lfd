import type { OperationAudience } from "../value-objects/operation-audience.js";
import type { OperationImage, OperationImageInput } from "../value-objects/operation-image.js";
import type {
  OperationSchedule,
  OperationScheduleInput,
} from "../value-objects/operation-schedule.js";
import type { OperationText, OperationTextInput } from "../value-objects/operation-text.js";

/** Les formes que l'agrégat `Operation` prend et rend — rangées à part pour qu'il reste lisible. */

/** Ce que l'annonce affiche, tel qu'on le donne : le nom, l'accroche, l'image. */
export interface OperationPresentationInput {
  readonly name: OperationTextInput;
  readonly lede: OperationTextInput | null;
  readonly image: OperationImageInput | null;
}

/** Ce que l'annonce affiche, une fois jugé. */
export interface OperationPresentation {
  readonly name: OperationText;
  readonly lede: OperationText | null;
  readonly image: OperationImage | null;
}

/**
 * **Qui écrit, et quand** — chaque geste du commerce le porte. `by` est un
 * `StaffUser.id`, `null` hors requête.
 */
export interface WriteStamp {
  readonly by: string | null;
  readonly at: Date;
}

/** Ce qu'il faut pour préparer une opération. La sélection commence vide. */
export interface PrepareOperation extends OperationPresentationInput {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  readonly audience: string;
}

/**
 * **Le calendrier tel que l'écran le règle** : les cinq dates, et si la
 * boutique affiche l'heure de clôture (« avant le 21 décembre à 12:00 ») ou
 * le jour seul.
 */
export interface OperationCalendarInput {
  readonly schedule: OperationScheduleInput;
  readonly showsOrderUntilTime: boolean;
}

/** L'état tel que la base le rend, jours et clientèle encore bruts. */
export interface OperationRecord extends OperationPresentationInput {
  readonly key: string;
  readonly schedule: OperationScheduleInput;
  /** La boutique dit l'heure de clôture, pas seulement le jour. */
  readonly showsOrderUntilTime: boolean;
  readonly audience: string;
  readonly skus: readonly string[];
  readonly hidden: boolean;
  readonly archivedAt: Date | null;
  /** `null` : jamais écrite au commerce — une ligne reçue du référentiel seulement. */
  readonly lastWrite: WriteStamp | null;
}

/**
 * **Une opération telle que la migration l'apporte du référentiel** (lot 3) :
 * ses valeurs, déjà restreintes par la surcharge de la réception.
 */
export type ReferentialOperation = Omit<OperationRecord, "lastWrite" | "showsOrderUntilTime">;

/** L'état complet, tel que le dépôt l'écrit. */
export interface OperationSnapshot extends OperationPresentation {
  readonly key: string;
  readonly schedule: OperationSchedule;
  readonly showsOrderUntilTime: boolean;
  readonly audience: OperationAudience;
  readonly skus: readonly string[];
  readonly hidden: boolean;
  readonly archivedAt: Date | null;
  readonly lastWrite: WriteStamp | null;
}
