import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';
import type { ActivationStatus, ActivationView } from '@lfd/contracts';

import { ActivationsService } from './activations.service';

type LoadState = 'loading' | 'ready' | 'error';
type FilterValue = 'all' | ActivationStatus;

const FILTER_ORDER: readonly FilterValue[] = ['all', 'pending', 'active'];

function isFilterValue(value: string): value is FilterValue {
  return (FILTER_ORDER as readonly string[]).includes(value);
}

/** Libellé FR de chaque pièce d'activation. */
const STEP_LABELS: Record<string, string> = {
  tva: 'TVA',
  kbis: 'KBIS',
  billing: 'Facturation',
  delivery: 'Livraison',
};

/**
 * Le **tunnel d'activation** — les dossiers déjà inscrits, avec leurs pièces
 * manquantes et leurs blocages. Dérivé du journal (`GET /admin/activations`).
 *
 * C'était un onglet ; c'est devenu **le second étage de Prospects**. La raison
 * est qu'il n'y avait jamais eu deux sujets : froid → tiède → chaud → inscrit →
 * activé est un seul parcours, et le couper en deux écrans obligeait le
 * commercial à deviner de quel côté chercher quelqu'un. Il porte donc sa propre
 * barre de filtres, mais plus son en-tête de page.
 *
 * Chaque société montre sa **complétion** de pièces, si elle s'est activée seule
 * (**adoption+**, product-led), et depuis combien de jours elle est **bloquée**.
 * Les `pending` d'abord, les plus anciennement bloqués en tête (tri serveur).
 */
@Component({
  selector: 'app-activation-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldViewToggleComponent,
    FoldEmptyStateComponent,
  ],
  templateUrl: './activation-table.html',
  styleUrl: './activation-table.scss',
})
export class ActivationTable {
  private readonly service = inject(ActivationsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly activations = signal<readonly ActivationView[]>([]);
  protected readonly filter = signal<FilterValue>('all');

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'companyId', label: 'Société' },
    { key: 'status', label: 'Statut', width: '7rem' },
    { key: 'completion', label: 'Pièces', width: '12rem' },
    { key: 'adoptionPlus', label: 'Adoption', width: '8rem' },
    { key: 'stalledDays', label: 'Bloqué', width: '6rem', align: 'right' },
  ];

  protected readonly segments: readonly FoldViewToggleOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'pending', label: 'En attente' },
    { value: 'active', label: 'Actifs' },
  ];

  protected readonly adoptionPlusCount = computed(
    () => this.activations().filter((a) => a.adoptionPlus).length,
  );
  protected readonly stalledCount = computed(
    () =>
      this.activations().filter((a) => a.status === 'pending' && (a.stalledDays ?? 0) >= 7).length,
  );

  protected readonly filtered = computed<readonly ActivationView[]>(() => {
    const current = this.filter();
    const all = this.activations();
    return current === 'all' ? all : all.filter((a) => a.status === current);
  });

  protected readonly emptyState = computed<FoldTableEmpty>(() => ({
    title: 'Aucun dossier',
    subtitle: 'Aucune société déclarée sur cette période.',
  }));

  protected readonly rowKey = (activation: ActivationView): string => activation.companyId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.activations.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onFilterChange(value: string): void {
    if (isFilterValue(value)) {
      this.filter.set(value);
    }
  }

  /** « 2/4 » — pièces franchies sur le total. */
  protected completionLabel(activation: ActivationView): string {
    return `${activation.stepsReached.length}/4`;
  }

  /** Libellés FR des pièces encore manquantes, séparés par des virgules. */
  protected missingLabel(activation: ActivationView): string {
    return activation.stepsMissing.map((step) => STEP_LABELS[step] ?? step).join(', ');
  }

  /** Jours de blocage, ou `—` si le dossier est actif. */
  protected stalledLabel(activation: ActivationView): string {
    return activation.stalledDays === null ? '—' : `${activation.stalledDays} j`;
  }
}
