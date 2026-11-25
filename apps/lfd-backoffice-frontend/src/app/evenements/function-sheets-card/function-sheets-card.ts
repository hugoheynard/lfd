import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { EVENT_FUNCTION_SHEET_MAX_BYTES, type FunctionSheetView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { blobRefusalMessage } from '../../shared/download/blob-refusal';
import { saveBlob } from '../../shared/download/save-blob';
import { GestureIntents } from '../../shared/gesture-intents';
import { sheetRefusal, sizeLabel, stampLabel } from '../event-format';
import { EventsService } from '../events.service';

const COLUMNS: readonly FoldTableColumn<FunctionSheetView>[] = [
  { key: 'fileName', label: 'Fiche', value: (row) => row.fileName },
  { key: 'uploadedAt', label: 'Déposée le', value: (row) => stampLabel(row.uploadedAt) },
  { key: 'size', label: 'Taille', numeric: true, value: (row) => sizeLabel(row.sizeBytes) },
  { key: 'actions', label: 'Actions' },
];

/**
 * **Les fiches de fonction d'un événement**
 * (`documentation/evenements/plan-evenements.md`, E2) — les télécharger, en
 * déposer une en PDF, en retirer une après confirmation. L'écran refuse avant
 * l'envoi un fichier qui n'est pas un PDF ou qui dépasse la borne ; pour le
 * reste, c'est le refus du serveur qui s'affiche.
 */
@Component({
  selector: 'app-function-sheets-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './function-sheets-card.html',
  styleUrl: './function-sheets-card.scss',
})
export class FunctionSheetsCard {
  private readonly api = inject(EventsService);
  private readonly notify = inject(NotifyService);
  /** Une clé par dépôt, renvoyée jusqu'au succès : un double envoi ne dépose pas deux fiches. */
  private readonly intents = new GestureIntents();

  readonly eventId = input.required<string>();
  readonly sheets = input.required<readonly FunctionSheetView[]>();
  readonly canWrite = input(false);
  /** Une fiche a été déposée ou retirée : le parent relit l'événement. */
  readonly changed = output();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: FunctionSheetView): string => row.id;
  protected readonly hint = `Un PDF de ${sizeLabel(EVENT_FUNCTION_SHEET_MAX_BYTES)} au plus — depuis Excel : « Exporter en PDF ».`;

  protected readonly depositing = signal(false);
  /** La fiche que le prochain dépôt remplace, ou `null` pour un dépôt neuf. */
  readonly replacing = signal<FunctionSheetView | null>(null);
  /** La fiche en cours de retrait ou de téléchargement. */
  protected readonly pending = signal<string | null>(null);

  async picked(files: readonly File[]): Promise<void> {
    const [file] = files;
    if (file === undefined || this.depositing()) {
      return;
    }
    const refusal = sheetRefusal(file);
    if (refusal !== null) {
      this.notify.refused(null, refusal);
      return;
    }
    const replaced = this.replacing();
    const subject = `${replaced === null ? 'deposit' : `replace:${replaced.id}`}:${this.eventId()}:${file.name}:${file.size}`;
    this.depositing.set(true);
    try {
      const key = this.intents.keyFor(subject);
      if (replaced === null) {
        await this.api.depositSheet(this.eventId(), file, key);
      } else {
        await this.api.replaceSheet(this.eventId(), replaced.id, file, key);
      }
      this.intents.done(subject);
      this.replacing.set(null);
      this.notify.success(
        replaced === null ? 'Fiche déposée.' : 'Fiche remplacée par la nouvelle version.',
      );
      this.changed.emit();
    } catch (error) {
      this.notify.refused(error, 'La fiche n’a pas pu être déposée.');
    } finally {
      this.depositing.set(false);
    }
  }

  protected async download(sheet: FunctionSheetView): Promise<void> {
    this.pending.set(sheet.id);
    try {
      saveBlob(await this.api.sheetFile(this.eventId(), sheet.id), sheet.fileName);
    } catch (error) {
      this.notify.refused(null, await blobRefusalMessage(error));
    } finally {
      this.pending.set(null);
    }
  }

  async archive(sheet: FunctionSheetView): Promise<void> {
    this.pending.set(sheet.id);
    try {
      await this.api.archiveSheet(this.eventId(), sheet.id);
      this.notify.success('Fiche retirée.');
      this.changed.emit();
    } catch (error) {
      this.notify.refused(error, 'La fiche n’a pas pu être retirée.');
    } finally {
      this.pending.set(null);
    }
  }
}
