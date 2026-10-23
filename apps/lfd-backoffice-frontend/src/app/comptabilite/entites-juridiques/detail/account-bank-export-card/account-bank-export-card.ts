import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  AccountBankAccountView,
  AccountBankExportSummaryView,
  AccountBankExportsView,
  LegalEntityView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { blobRefusalMessage } from '../../../../shared/download/blob-refusal';
import { saveBlob } from '../../../../shared/download/save-blob';
import {
  ACCOUNT_BANK_EXCLUSION_LABELS,
  accountExportStateLabel,
  accountsLabel,
} from '../../../account-bank-export-wording';
import { AccountBankExportsService } from '../../../account-bank-exports.service';
import { parisDayLabel } from '../../../mandate-bank-export-wording';

/**
 * **Comptes à la banque** — préparer, télécharger, marquer importé ou
 * abandonner le fichier des comptes destinataires du portail de la banque, et
 * déclarer un compte « déjà connu » (doc `prerequis-export-ribs.md`).
 *
 * ## Pourquoi « nouveaux seulement » se voit
 *
 * Un seul compte que la banque connaît déjà fait rejeter TOUT l'import
 * (réponse 8). La carte montre donc ce qui est en vol (préparé, pas encore
 * dit importé), et propose « déjà connu » sur chaque compte à exporter : un
 * compte saisi à la main dans CENET doit être déclaré, sinon il repartirait.
 *
 * Un fichier téléchargé n'est pas un fichier importé : la carte ne déduit
 * rien d'un clic sur « Télécharger ».
 */
@Component({
  selector: 'app-account-bank-export-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './account-bank-export-card.html',
  styleUrl: './account-bank-export-card.scss',
})
export class AccountBankExportCard {
  private readonly service = inject(AccountBankExportsService);

  readonly entity = input.required<LegalEntityView>();

  /**
   * Après chaque geste, réussi ou refusé, une fois la carte relue : l'hôte
   * qui calcule un état à partir des comptes (la page « Procédure de
   * prélèvement ») le relit. La fiche de l'entité ne l'écoute pas.
   */
  readonly changed = output();

  protected readonly view = signal<AccountBankExportsView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly reasonLabels = ACCOUNT_BANK_EXCLUSION_LABELS;
  protected readonly accounts = accountsLabel;
  protected readonly day = parisDayLabel;
  protected readonly stateOf = accountExportStateLabel;

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

  /** Les comptes qui attendront l'export d'après (200 au plus par fichier). */
  protected leftOver(view: AccountBankExportsView): number {
    return Math.max(0, view.toExport.length - view.maxPerExport);
  }

  protected isOpen(item: AccountBankExportSummaryView): boolean {
    return item.importedAt === null && item.abandonedAt === null;
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entity().id;
    await this.run(async () => {
      const exportId = await this.service.prepare(entityId);
      await this.download(exportId);
    });
  }

  protected async downloadFile(item: AccountBankExportSummaryView): Promise<void> {
    await this.run(() => this.download(item.id));
  }

  protected async markImported(item: AccountBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.markImported(entityId, item.id));
  }

  protected async abandon(item: AccountBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.abandon(entityId, item.id));
  }

  protected async declareKnown(account: AccountBankAccountView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.declareKnown(entityId, account.bankAccountId));
  }

  private async download(exportId: string): Promise<void> {
    const blob = await this.service.file(this.entity().id, exportId);
    saveBlob(blob, `comptes-banque-${this.entity().siren}-${exportId}.csv`);
  }

  /** Un geste, puis la carte relue — même après un refus, qui peut venir d'un état périmé. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error: unknown) {
      this.actionError.set(await blobRefusalMessage(error));
    } finally {
      await this.load();
      this.busy.set(false);
      this.changed.emit();
    }
  }
}
