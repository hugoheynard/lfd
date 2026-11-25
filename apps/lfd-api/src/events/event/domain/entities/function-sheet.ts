/** L'état d'une fiche de fonction, tel que la base le garde. */
export interface FunctionSheetState {
  readonly id: string;
  readonly fileName: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly position: number;
  readonly uploadedBy: string;
  readonly uploadedAt: Date;
  readonly archivedAt: Date | null;
  /** La fiche que celle-ci remplace, ou `null` pour un dépôt neuf. */
  readonly replacesSheetId: string | null;
}

/**
 * **Une fiche de fonction** — une entité de l'agrégat {@link Event}, pas un
 * agrégat de plus : son rang, son dépôt et son retrait sont des règles de
 * l'événement. Elle ne se supprime pas : elle s'archive, et son objet reste au
 * stockage.
 */
export class FunctionSheet {
  private constructor(
    private readonly state: FunctionSheetState,
    private archived: Date | null,
  ) {}

  static rehydrate(state: FunctionSheetState): FunctionSheet {
    return new FunctionSheet(state, state.archivedAt);
  }

  /** La clé au stockage du fournil, composée d'identifiants vérifiés — jamais du client. */
  static storageKeyOf(eventId: string, sheetId: string): string {
    return `events/${eventId}/function-sheets/${sheetId}.pdf`;
  }

  get id(): string {
    return this.state.id;
  }

  get fileName(): string {
    return this.state.fileName;
  }

  get storageKey(): string {
    return this.state.storageKey;
  }

  get contentType(): string {
    return this.state.contentType;
  }

  get sizeBytes(): number {
    return this.state.sizeBytes;
  }

  get position(): number {
    return this.state.position;
  }

  get uploadedBy(): string {
    return this.state.uploadedBy;
  }

  get uploadedAt(): Date {
    return this.state.uploadedAt;
  }

  get archivedAt(): Date | null {
    return this.archived;
  }

  get replacesSheetId(): string | null {
    return this.state.replacesSheetId;
  }

  get isActive(): boolean {
    return this.archived === null;
  }

  /** Retirer une fiche déjà retirée ne change rien : le geste rejoué rend le même état. */
  archive(at: Date): void {
    if (this.archived === null) {
      this.archived = at;
    }
  }
}
