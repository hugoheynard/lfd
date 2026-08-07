import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPanelHostService,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';
import type { MomentumTrajectory, ProspectTemperature, ProspectView } from '@lfd/contracts';

import { LeadCapturePanel } from './lead-capture-panel/lead-capture-panel';
import { ProspectsService } from './prospects.service';

type LoadState = 'loading' | 'ready' | 'error';
type FilterValue = 'all' | ProspectTemperature;

/** Badge variant (fold) — accepté par `fold-badge [variant]`. */
type BadgeVariant = 'neutral' | 'accent' | 'info' | 'warning' | 'alert' | 'success';

/** Libellé + ton de chaque température (`cold` = lead sortant saisi). */
const TEMPERATURE: Record<ProspectTemperature, { label: string; variant: BadgeVariant }> = {
  hot: { label: 'Chaud', variant: 'warning' },
  mid: { label: 'Tiède', variant: 'info' },
  cold: { label: 'Froid', variant: 'neutral' },
};

/** Libellé + ton de chaque trajectoire de momentum. */
const MOMENTUM: Record<MomentumTrajectory, { label: string; variant: BadgeVariant }> = {
  accelerating: { label: 'Accélère', variant: 'success' },
  stable: { label: 'Stable', variant: 'info' },
  cooling: { label: 'Refroidit', variant: 'warning' },
  dormant: { label: 'Dormant', variant: 'neutral' },
};

const FILTER_ORDER: readonly FilterValue[] = ['all', 'hot', 'mid', 'cold'];

function isFilterValue(value: string): value is FilterValue {
  return (FILTER_ORDER as readonly string[]).includes(value);
}

/**
 * Onglet **Prospects** (commercial) : la **file entrante unifiée**. **hot** = a
 * commandé, **mid** = inscrit sans commande (tous deux **dérivés du journal**),
 * **cold** = **saisi par un commercial** (démarchage sortant, agrégat `Lead`). Lue
 * via `GET /admin/prospects`, filtrée par un segment (tous / chauds / tièdes /
 * froids). Le bouton **Ajouter un lead** ouvre le panneau de saisie cold.
 */
@Component({
  selector: 'app-prospects-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableComponent,
    FoldDataTableCellDirective,
    FoldViewToggleComponent,
  ],
  templateUrl: './prospects-page.html',
  styleUrl: './prospects-page.scss',
})
export class ProspectsPage {
  private readonly service = inject(ProspectsService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly prospects = signal<readonly ProspectView[]>([]);
  protected readonly filter = signal<FilterValue>('all');

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'temperature', label: '', width: '5rem' },
    { key: 'email', label: 'Prospect' },
    { key: 'momentum', label: 'Momentum', width: '8rem' },
    { key: 'orderCount', label: 'Cmd', width: '5rem', align: 'right' },
    { key: 'totalCents', label: 'Total', width: '8rem', align: 'right' },
    { key: 'lastOrderAt', label: 'Dernière', width: '7rem', align: 'right' },
    { key: 'recencyDays', label: 'Récence', width: '6rem', align: 'right' },
  ];

  protected readonly segments: readonly FoldViewToggleOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'hot', label: 'Chauds' },
    { value: 'mid', label: 'Tièdes' },
    { value: 'cold', label: 'Froids' },
  ];

  protected readonly hotCount = computed(
    () => this.prospects().filter((p) => p.temperature === 'hot').length,
  );
  protected readonly coldCount = computed(
    () => this.prospects().filter((p) => p.temperature === 'cold').length,
  );
  protected readonly midCount = computed(
    () => this.prospects().filter((p) => p.temperature === 'mid').length,
  );

  protected readonly filtered = computed<readonly ProspectView[]>(() => {
    const current = this.filter();
    const all = this.prospects();
    return current === 'all' ? all : all.filter((p) => p.temperature === current);
  });

  protected readonly emptyState = computed<FoldTableEmpty>(() => ({
    title: 'Aucun prospect',
    subtitle: 'Personne n’a encore tenté l’expérience sur cette période.',
  }));

  protected readonly rowKey = (prospect: ProspectView): string => prospect.subjectId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.prospects.set(await this.service.list());
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

  /** Ouvre le panneau de saisie d'un lead cold ; recharge la file si un lead a été ajouté. */
  protected async openCapture(): Promise<void> {
    const ref = this.panels.open<undefined, boolean>(LeadCapturePanel, {
      data: undefined,
      width: 'md',
    });
    const added = await ref.closed;
    if (added === true) {
      await this.load();
    }
  }

  protected temperatureOf(prospect: ProspectView): { label: string; variant: BadgeVariant } {
    return TEMPERATURE[prospect.temperature];
  }

  protected momentumOf(prospect: ProspectView): { label: string; variant: BadgeVariant } {
    return MOMENTUM[prospect.momentum];
  }

  /** Montant en euros (les centimes du contrat). */
  protected euros(cents: number): string {
    return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  }

  protected formatDate(iso: string | null): string {
    return iso === null ? '—' : new Date(iso).toLocaleDateString('fr-FR');
  }
}
