import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import type {
  LegalEntityView,
  MandateBankExportSummaryView,
  MandateBankExportsView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { saveBlob } from '../../../../shared/download/save-blob';
import {
  MANDATE_BANK_EXCLUSION_LABELS,
  mandatesLabel,
  parisDayLabel,
} from '../../../mandate-bank-export-wording';
import { MandateBankExportsService } from '../../../mandate-bank-exports.service';

/**
 * **Mandats à la banque** — préparer, télécharger et marquer importé le
 * fichier d'import des mandats du portail de la banque (plan
 * `export-des-mandats-pour-la-banque.md`).
 *
 * ## Trois gestes, et aucun ne se confond avec un autre
 *
 * Préparer FIGE un export ; télécharger le RECALCULE (le serveur refuse si un
 * compte a changé depuis) ; marquer importé est ce qui retire ses mandats de
 * « à exporter ». Un fichier téléchargé n'est pas un fichier importé : la
 * carte ne déduit rien d'un clic sur « Télécharger ».
 *
 * ## Les écartés sont nommés, pas tus
 *
 * Mandat repris d'un autre créancier, sans RIB recopié, ou sans BIC : la
 * phrase vient du code de la raison, la sortie avec elle.
 */
@Component({
  selector: 'app-mandate-bank-export-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './mandate-bank-export-card.html',
  styleUrl: './mandate-bank-export-card.scss',
})
export class MandateBankExportCard {
  private readonly service = inject(MandateBankExportsService);

  readonly entity = input.required<LegalEntityView>();

  protected readonly view = signal<MandateBankExportsView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** « Tous les mandats actifs », y compris ceux que la banque a déjà. */
  protected readonly all = signal(false);

  protected readonly reasonLabels = MANDATE_BANK_EXCLUSION_LABELS;
  protected readonly mandates = mandatesLabel;
  protected readonly day = parisDayLabel;

  constructor() {
    effect(() => {
      void this.load(this.entity().id);
    });
  }

  protected async load(entityId = this.entity().id): Promise<void> {
    try {
      this.view.set(await this.service.of(entityId));
      this.loadError.set(null);
    } catch (error: unknown) {
      this.loadError.set(httpErrorMessage(error));
    }
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entity().id;
    await this.run(async () => {
      const exportId = await this.service.prepare(entityId, this.all());
      this.all.set(false);
      await this.download(exportId);
    });
  }

  protected async downloadFile(item: MandateBankExportSummaryView): Promise<void> {
    await this.run(() => this.download(item.id));
  }

  protected async markImported(item: MandateBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.markImported(entityId, item.id));
  }

  private async download(exportId: string): Promise<void> {
    const blob = await this.service.file(this.entity().id, exportId);
    saveBlob(blob, `mandats-banque-${this.entity().siren}-${exportId}.csv`);
  }

  /** Un geste, puis la carte relue — même après un refus, qui peut venir d'un état périmé. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error: unknown) {
      this.actionError.set(await refusalOf(error));
    } finally {
      await this.load();
      this.busy.set(false);
    }
  }
}

/**
 * Le refus du serveur, même quand la réponse attendue était un FICHIER : un
 * 409 sur `file.csv` arrive en `Blob`, et `httpErrorMessage` n'y lirait rien —
 * or c'est ce message qui nomme les RUM dont le compte a changé.
 */
async function refusalOf(error: unknown): Promise<string> {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = error.error;
    if (body instanceof Blob) {
      try {
        const parsed: unknown = JSON.parse(await textOf(body));
        return httpErrorMessage({ error: parsed });
      } catch {
        return httpErrorMessage(error);
      }
    }
  }
  return httpErrorMessage(error);
}

/** `FileReader` plutôt que `Blob.text()` : le second manque à jsdom, où la suite tourne. */
function textOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Réponse illisible.'));
    };
    reader.readAsText(blob);
  });
}
