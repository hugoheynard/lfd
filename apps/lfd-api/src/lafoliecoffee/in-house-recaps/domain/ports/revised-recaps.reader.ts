/** Un BL révisé après récapitulatif. */
export interface RevisedNote {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly frozenVersion: number;
  readonly currentVersion: number;
}

/** Un signalement (D8) : un récapitulatif non remplacé dont un BL a été révisé. */
export interface RevisedRecap {
  readonly recapId: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly notes: readonly RevisedNote[];
}

/** Les signalements, tous payeurs : ce qui attend un « Réémettre ». */
export abstract class RevisedRecapsReader {
  abstract revised(): Promise<readonly RevisedRecap[]>;
}
