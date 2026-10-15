import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { LegalDocumentFileView, SalesTermsDocument } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFileDropzoneComponent,
  FoldIconComponent,
  FoldLinkComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { legalFileUrl, PlatformContentService } from '../../platform-content.service';
import { dayOf, sizeOf, stampOf } from './legal-pdf-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'uploadedAt', label: 'Déposé le' },
  { key: 'author', label: 'Par' },
  { key: 'size', label: 'Taille', numeric: true },
  { key: 'state', label: 'État' },
  { key: 'download', label: 'Fichier' },
];

/**
 * **Le document PDF de référence** d'un texte de CGV (plan
 * `legal/plan-cgv-par-audience.md`, C3, C5) : le PDF des juristes, dont les
 * articles de la page sont la lecture en ligne.
 *
 * Déposer, remplacer — un dépôt neuf remplace le précédent, qui reste dans
 * l'historique et se télécharge toujours —, et signaler quand le texte en
 * ligne a été modifié APRÈS le PDF en vigueur. Les deux peuvent diverger :
 * l'écran le dit, il ne l'empêche pas.
 */
@Component({
  selector: 'app-legal-pdf-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFileDropzoneComponent,
    FoldIconComponent,
    FoldLinkComponent,
  ],
  templateUrl: './legal-pdf-card.html',
  styleUrl: './legal-pdf-card.scss',
})
export class LegalPdfCard {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);

  readonly document = input.required<SalesTermsDocument>();
  /** La date de la dernière révision du texte en ligne, `null` s'il n'a jamais été écrit. */
  readonly textUpdatedAt = input<string | null>(null);
  readonly canWrite = input(false);

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: LegalDocumentFileView): string => row.id;

  protected readonly files = signal<readonly LegalDocumentFileView[]>([]);
  /** L'historique n'a pas pu être lu : la liste vide ne veut rien dire. */
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  /** Le PDF en vigueur — le seul sans date de remplacement. */
  protected readonly current = computed(
    () => this.files().find((file) => file.supersededAt === null) ?? null,
  );

  /** Le texte a été révisé APRÈS le dépôt du PDF en vigueur (C3, « cohérence »). */
  protected readonly textIsNewer = computed(() => {
    const current = this.current();
    const text = this.textUpdatedAt();
    return current !== null && text !== null && Date.parse(text) > Date.parse(current.uploadedAt);
  });

  constructor() {
    // L'onglet change le texte sans recréer la carte : l'historique se relit.
    effect(() => {
      void this.load(this.document());
    });
  }

  protected urlOf(file: LegalDocumentFileView): string {
    return legalFileUrl(file.document, file.id);
  }

  protected stamp(iso: string): string {
    return stampOf(iso);
  }

  protected day(iso: string): string {
    return dayOf(iso);
  }

  protected size(bytes: number): string {
    return sizeOf(bytes);
  }

  protected async picked(files: readonly File[]): Promise<void> {
    const [file] = files;
    if (file === undefined) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.depositLegalFile(this.document(), file);
      this.notify.success('PDF déposé : il est désormais la version de référence.');
      await this.load(this.document());
    } catch (error) {
      this.notify.refused(error, 'Dépôt refusé — seul un PDF de 10 Mo au plus est accepté.');
    } finally {
      this.busy.set(false);
    }
  }

  private async load(document: SalesTermsDocument): Promise<void> {
    try {
      const history = await this.api.legalFileHistory(document);
      this.files.set(history.files);
      this.loadError.set(false);
    } catch (error) {
      this.notify.error(error, 'L’historique des PDF n’a pas pu être lu.');
      this.loadError.set(true);
    }
  }
}
