import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';

import { companyDisplayName } from '@lfd/contracts';
import type { AdminCompany } from '../admin-company';
import {
  inScope,
  PIECES,
  pendingRows,
  pipelineFunnel,
  type PipelineRow,
  type PipelineScope,
} from './self-signup-pipeline.model';

function isScope(value: string): value is PipelineScope {
  return value === 'self' || value === 'all';
}

/**
 * Le **pipeline d'activation** de Comptes clients — la vue « Inscrit seul ·
 * dossier incomplet ». Il remplace l'étage Activation de Prospects, qui le
 * dérivait du journal en mémoire : ici tout se lit sur la société elle-même
 * (`declaredVia`, `piecesReached`), déjà chargée par la liste
 * (plan `documentation/b2b/plan-auto-acquisition-pro.md`, P1).
 *
 * Présentation pure : la liste et l'instant viennent de la page.
 */
@Component({
  selector: 'app-self-signup-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldElementTitleComponent,
    FoldMeterComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './self-signup-pipeline.html',
  styleUrl: './self-signup-pipeline.scss',
})
export class SelfSignupPipeline {
  readonly companies = input.required<readonly AdminCompany[]>();
  /** L'instant qui date « bloqué depuis » — injecté, jamais lu ici. */
  readonly now = input.required<Date>();
  readonly loading = input(false);

  private readonly router = inject(Router);

  protected readonly scope = signal<PipelineScope>('self');

  protected readonly scopes: readonly FoldViewToggleOption[] = [
    { value: 'self', label: 'Inscrits seuls' },
    { value: 'all', label: 'Tous' },
  ];

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'company', label: 'Société' },
    { key: 'pieces', label: 'Pièces' },
    { key: 'stalled', label: 'Bloqué depuis', width: '8rem', align: 'right' },
  ];

  private readonly scoped = computed(() =>
    this.companies().filter((company) => inScope(company, this.scope())),
  );

  /**
   * Une barre par étape, dans l'ORDRE FIXE, rapportée aux déclarées. Pas un
   * entonnoir ECharts : il retriait les marches par taille (Facturation avant
   * KBIS) et serrait les libellés dans des bandes illisibles — et les pièces
   * ne sont pas séquentielles (Hugo, 2026-10-25 : « pas très lisibles »).
   */
  protected readonly steps = computed(() => {
    const steps = pipelineFunnel(this.scoped());
    const declared = steps[0]?.count ?? 0;
    return steps.map((step) => ({ ...step, max: declared === 0 ? 1 : declared }));
  });

  protected readonly rows = computed<readonly PipelineRow[]>(() =>
    pendingRows(this.scoped(), this.now()),
  );

  protected readonly title = computed(() => `Dossiers en attente · ${this.rows().length}`);

  protected readonly empty = computed<FoldTableEmpty>(() => ({
    title: 'Aucun dossier en attente',
    subtitle:
      this.scope() === 'self'
        ? 'Aucun pro inscrit seul n’attend son activation.'
        : 'Aucune société déclarée n’attend son activation.',
  }));

  protected readonly displayName = companyDisplayName;
  /** Le dénominateur du « x/3 » : les pièces que l'activation exige. */
  protected readonly pieceCount = PIECES.length;
  protected readonly rowKey = (row: PipelineRow): string => row.company.id;

  protected onScopeChange(value: string): void {
    if (isScope(value)) {
      this.scope.set(value);
    }
  }

  protected open(row: PipelineRow): void {
    void this.router.navigate(['/comptes-clients', row.company.id]);
  }
}
