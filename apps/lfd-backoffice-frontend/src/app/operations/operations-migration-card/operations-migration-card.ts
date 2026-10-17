import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { OperationMigrationLineView, OperationsMigrationReport } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { formatInstant } from '../operation-schedule';
import {
  explanationLabel,
  fieldLabel,
  outcomeLabel,
  outcomeVariant,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **La reprise des opérations depuis le référentiel** — en deux temps
 * (`plan-l-operation-passe-au-commerce.md`, O4 corrigé) : l'aperçu, champ par
 * champ, lisible interrupteur fermé ; puis l'application, offerte seulement
 * interrupteur OUVERT, sans ligne bloquée, et après confirmation. Le relevé
 * rendu après remplace l'aperçu : c'est lui qu'on relit.
 */
@Component({
  selector: 'app-operations-migration-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './operations-migration-card.html',
  styleUrl: './operations-migration-card.scss',
})
export class OperationsMigrationCard {
  private readonly api = inject(CommerceOperationsService);

  /** La reprise a écrit : la liste se relit. */
  readonly applied = output();

  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<OperationsMigrationReport | null>(null);
  /** `true` une fois appliquée : le relevé affiché est celui d'APRÈS. */
  protected readonly after = signal(false);
  protected readonly applying = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canApply = computed(() => {
    const report = this.report();
    return report !== null && !report.blocked && report.counts.toWrite > 0;
  });

  protected readonly readAt = computed(() => {
    const report = this.report();
    return report === null ? '' : formatInstant(report.readAt);
  });

  protected readonly outcomeLabel = (line: OperationMigrationLineView): string =>
    outcomeLabel(line.outcome);
  protected readonly outcomeVariant = (line: OperationMigrationLineView) =>
    outcomeVariant(line.outcome);
  protected readonly fieldLabel = fieldLabel;
  protected readonly instant = formatInstant;
  protected readonly explanationLabel = explanationLabel;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.report.set(await this.api.previewMigration());
      this.after.set(false);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async apply(): Promise<void> {
    this.applying.set(true);
    this.refusal.set(null);
    try {
      this.report.set(await this.api.applyMigration());
      this.after.set(true);
      this.applied.emit();
    } catch (error: unknown) {
      this.refusal.set(httpErrorMessage(error, "La reprise n'a pas pu s'appliquer."));
    } finally {
      this.applying.set(false);
    }
  }
}
