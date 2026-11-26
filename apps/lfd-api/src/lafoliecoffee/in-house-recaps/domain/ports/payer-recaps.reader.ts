/** Un récapitulatif dans la liste d'un payeur. */
export interface RecapSummary {
  readonly id: string;
  readonly number: string;
  readonly month: string;
  readonly issuedAt: Date;
  readonly hasDocument: boolean;
  readonly replacedById: string | null;
  readonly noteCount: number;
  /** BL révisés depuis l'émission (D8) ; toujours 0 pour un récapitulatif remplacé. */
  readonly revisedNoteCount: number;
}

/** Les récapitulatifs d'un payeur, remplacés compris, du plus récent au plus ancien. */
export abstract class PayerRecapsReader {
  abstract summariesOf(payerId: string): Promise<readonly RecapSummary[]>;
}
