import {
  EventArchivedError,
  FunctionSheetNotFoundError,
  FunctionSheetRetiredError,
} from "../errors/event-errors.js";
import { EventApplications, type EventApplication } from "../value-objects/event-applications.js";
import type { EventDate } from "../value-objects/event-date.js";
import type { EventName } from "../value-objects/event-name.js";
import type { FunctionSheetPdf } from "../value-objects/function-sheet-pdf.js";
import { FunctionSheet, type FunctionSheetState } from "./function-sheet.js";

/** Ce que la déclaration demande. */
export interface EventDeclaration {
  readonly id: string;
  readonly name: EventName;
  readonly date: EventDate;
  readonly applications: EventApplications;
  readonly createdBy: string;
  readonly at: Date;
}

/** L'état d'un événement, tel que la base le garde. */
export interface EventState {
  readonly id: string;
  readonly name: EventName;
  readonly date: EventDate;
  readonly applications: EventApplications;
  readonly archivedAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sheets: readonly FunctionSheetState[];
}

/** Ce que le dépôt d'une fiche demande. */
export interface SheetDeposit {
  readonly sheetId: string;
  readonly pdf: FunctionSheetPdf;
  readonly uploadedBy: string;
  readonly at: Date;
}

/**
 * **Un événement** — une journée d'event, les applications qu'elle concerne et
 * ses fiches de fonction (`documentation/evenements/plan-evenements.md`).
 *
 * Il porte ses fiches : leur rang et leur retrait sont ses règles, et la
 * première — « pas de dépôt sur un événement archivé » — s'écrit ici. Un
 * événement archivé ne reçoit plus aucun geste. Rien ne se supprime : un
 * événement et une fiche s'archivent.
 */
export class Event {
  private constructor(
    readonly id: string,
    private currentName: EventName,
    private currentDate: EventDate,
    readonly applications: EventApplications,
    private archived: Date | null,
    readonly createdBy: string,
    readonly createdAt: Date,
    private touched: Date,
    private readonly sheetList: FunctionSheet[],
  ) {}

  /** Déclare un événement neuf, en vigueur et sans fiche. */
  static declare(declaration: EventDeclaration): Event {
    return new Event(
      declaration.id,
      declaration.name,
      declaration.date,
      declaration.applications,
      null,
      declaration.createdBy,
      declaration.at,
      declaration.at,
      [],
    );
  }

  static rehydrate(state: EventState): Event {
    return new Event(
      state.id,
      state.name,
      state.date,
      state.applications,
      state.archivedAt,
      state.createdBy,
      state.createdAt,
      state.updatedAt,
      state.sheets.map((sheet) => FunctionSheet.rehydrate(sheet)),
    );
  }

  get name(): EventName {
    return this.currentName;
  }

  get date(): EventDate {
    return this.currentDate;
  }

  get archivedAt(): Date | null {
    return this.archived;
  }

  get updatedAt(): Date {
    return this.touched;
  }

  /** Toutes les fiches, retirées comprises, par rang (une version remplacée partage le sien). */
  get sheets(): readonly FunctionSheet[] {
    return [...this.sheetList].sort((a, b) => a.position - b.position);
  }

  /** Les fiches en vigueur, dans l'ordre de dépôt. */
  get activeSheets(): readonly FunctionSheet[] {
    return this.sheets.filter((sheet) => sheet.isActive);
  }

  concerns(application: EventApplication): boolean {
    return this.applications.includes(application);
  }

  rename(name: EventName, at: Date): void {
    this.assertLive();
    this.currentName = name;
    this.touched = at;
  }

  reschedule(date: EventDate, at: Date): void {
    this.assertLive();
    this.currentDate = date;
    this.touched = at;
  }

  /** Archiver un événement archivé ne change rien. */
  archive(at: Date): void {
    if (this.archived === null) {
      this.archived = at;
      this.touched = at;
    }
  }

  /**
   * Dépose une fiche à la suite des autres. Le rang suit le plus haut déjà
   * donné, retirées comprises : un rang ne se réattribue jamais.
   *
   * @throws {EventArchivedError} l'événement est archivé.
   */
  depositSheet(deposit: SheetDeposit): FunctionSheet {
    this.assertLive();
    return this.addSheet(deposit, this.nextPosition(), null);
  }

  /**
   * Remplace une fiche en vigueur par une version plus récente : l'ancienne
   * s'archive (gardée en base et au stockage), la nouvelle prend son rang et
   * dit qui elle remplace. C'est la version en vigueur qui part au dossier.
   *
   * @throws {EventArchivedError} l'événement est archivé.
   * @throws {FunctionSheetNotFoundError} la fiche n'est pas de cet événement.
   * @throws {FunctionSheetRetiredError} la fiche est déjà retirée ou remplacée.
   */
  replaceSheet(replacedId: string, deposit: SheetDeposit): FunctionSheet {
    this.assertLive();
    const replaced = this.sheetList.find((candidate) => candidate.id === replacedId);
    if (replaced === undefined) {
      throw new FunctionSheetNotFoundError(replacedId);
    }
    if (!replaced.isActive) {
      throw new FunctionSheetRetiredError(replaced.fileName);
    }
    replaced.archive(deposit.at);
    return this.addSheet(deposit, replaced.position, replaced.id);
  }

  private addSheet(
    deposit: SheetDeposit,
    position: number,
    replacesSheetId: string | null,
  ): FunctionSheet {
    const sheet = FunctionSheet.rehydrate({
      id: deposit.sheetId,
      fileName: deposit.pdf.fileName,
      storageKey: FunctionSheet.storageKeyOf(this.id, deposit.sheetId),
      contentType: deposit.pdf.contentType,
      sizeBytes: deposit.pdf.sizeBytes,
      position,
      uploadedBy: deposit.uploadedBy,
      uploadedAt: deposit.at,
      archivedAt: null,
      replacesSheetId,
    });
    this.sheetList.push(sheet);
    this.touched = deposit.at;
    return sheet;
  }

  /**
   * Retire une fiche (archivage, jamais effacement). Rejoué sur une fiche
   * déjà retirée, le geste ne change rien.
   *
   * @throws {EventArchivedError} l'événement est archivé.
   * @throws {FunctionSheetNotFoundError} la fiche n'est pas de cet événement.
   */
  archiveSheet(sheetId: string, at: Date): void {
    this.assertLive();
    const sheet = this.sheetList.find((candidate) => candidate.id === sheetId);
    if (sheet === undefined) {
      throw new FunctionSheetNotFoundError(sheetId);
    }
    if (sheet.isActive) {
      sheet.archive(at);
      this.touched = at;
    }
  }

  private nextPosition(): number {
    return this.sheetList.reduce((highest, sheet) => Math.max(highest, sheet.position + 1), 0);
  }

  private assertLive(): void {
    if (this.archived !== null) {
      throw new EventArchivedError(this.currentName.value);
    }
  }
}
