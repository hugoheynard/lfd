import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { FoldIconName } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
  FoldViewToggleComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldViewToggleOption,
} from 'fold-ng';
import type {
  LeadStatus,
  MomentumTrajectory,
  ProspectTemperature,
  ProspectView,
} from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { LeadsService } from '../leads.service';
import { LeadCapturePanel } from './lead-capture-panel/lead-capture-panel';
import { Chart, type ChartOption } from '../../shared/chart/chart';
import { funnelOption } from '../croissance/growth-charts';
import { GrowthService } from '../croissance/growth.service';
import { ActivationTable } from './activation/activation-table';
import { ProspectsService } from './prospects.service';

type LoadState = 'loading' | 'ready' | 'error';
type FilterValue = 'all' | ProspectTemperature;

/** Une action de suivi proposée sur une ligne cold. */
interface LeadAction {
  readonly status: Exclude<LeadStatus, 'new'>;
  readonly label: string;
  readonly icon: FoldIconName;
  readonly danger: boolean;
}

/** Rang des étapes actives (pour ne proposer que des transitions **avant**). */
const ACTIVE_RANK: Record<string, number> = { new: 0, contacted: 1, qualified: 2, negotiating: 3 };

/** Étapes actives franchissables + leur présentation. */
const ADVANCE_STEPS: readonly {
  status: Exclude<LeadStatus, 'new'>;
  label: string;
  icon: FoldIconName;
}[] = [
  { status: 'contacted', label: 'Marquer contacté', icon: 'phone' },
  { status: 'qualified', label: 'Marquer qualifié', icon: 'check' },
  { status: 'negotiating', label: 'En négociation', icon: 'stats' },
];

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
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldPopoverTriggerDirective,
    FoldViewToggleComponent,
    ActivationTable,
    Chart,
    FoldEmptyStateComponent,
  ],
  templateUrl: './prospects-page.html',
  styleUrl: './prospects-page.scss',
})
export class ProspectsPage {
  private readonly service = inject(ProspectsService);
  private readonly leads = inject(LeadsService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly growth = inject(GrowthService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly prospects = signal<readonly ProspectView[]>([]);
  protected readonly filter = signal<FilterValue>('all');

  /**
   * L'**étage** du parcours qu'on regarde : le vivier (avant compte) ou
   * l'activation (compte créé, pas encore actif). Deux moments d'un même
   * parcours, pas deux sujets — d'où une seule page.
   */
  protected readonly stage = signal<'vivier' | 'activation'>('vivier');
  protected readonly stages: readonly FoldViewToggleOption[] = [
    { value: 'vivier', label: 'Le vivier' },
    { value: 'activation', label: "L'activation" },
  ];

  /** L'entonnoir de l'étage affiché — c'est là qu'on voit OÙ ça se perd. */
  protected readonly funnel = signal<ChartOption | null>(null);
  private readonly funnels = signal<{ cold: ChartOption; activation: ChartOption } | null>(null);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'temperature', label: '', width: '5rem' },
    { key: 'email', label: 'Prospect' },
    { key: 'momentum', label: 'Momentum', width: '8rem' },
    { key: 'orderCount', label: 'Cmd', width: '5rem', align: 'right' },
    { key: 'totalCents', label: 'Total', width: '8rem', align: 'right' },
    { key: 'lastOrderAt', label: 'Dernière', width: '7rem', align: 'right' },
    { key: 'recencyDays', label: 'Récence', width: '6rem', align: 'right' },
    { key: 'actions', label: '', width: '3rem' },
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
    void this.loadFunnels();
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

  protected onStageChange(value: string): void {
    if (value !== 'vivier' && value !== 'activation') {
      return;
    }
    this.stage.set(value);
    this.applyFunnel();
  }

  /** L'entonnoir suit l'étage : le vivier montre le froid, l'activation le tunnel. */
  private applyFunnel(): void {
    const both = this.funnels();
    if (both === null) {
      return;
    }
    this.funnel.set(this.stage() === 'vivier' ? both.cold : both.activation);
  }

  /** Best-effort : un entonnoir absent ne doit pas priver de la liste. */
  private async loadFunnels(): Promise<void> {
    try {
      const stats = await this.growth.stats();
      this.funnels.set({
        cold: funnelOption(stats.coldFunnel, '#64748b'),
        activation: funnelOption(stats.activationFunnel, '#3b82f6'),
      });
      this.applyFunnel();
    } catch {
      this.funnels.set(null);
    }
  }

  protected onFilterChange(value: string): void {
    if (isFilterValue(value)) {
      this.filter.set(value);
    }
  }

  /**
   * Actions de suivi proposées pour une ligne cold : les étapes **en avant** (le
   * pipeline ne recule pas) + convertir / perdre. Vide pour un prospect entrant.
   */
  protected actionsFor(prospect: ProspectView): readonly LeadAction[] {
    const status = prospect.leadStatus;
    if (prospect.source !== 'outbound' || status === null) {
      return [];
    }
    const rank = ACTIVE_RANK[status] ?? 0;
    const forward: LeadAction[] = ADVANCE_STEPS.filter(
      (step) => (ACTIVE_RANK[step.status] ?? 0) > rank,
    ).map((step) => ({ ...step, danger: false }));
    return [
      ...forward,
      { status: 'converted', label: 'Convertir', icon: 'check-circle', danger: false },
      { status: 'lost', label: 'Marquer perdu', icon: 'x-circle', danger: true },
    ];
  }

  /** Applique une transition à un lead cold, puis recharge la file. */
  protected async advance(
    prospect: ProspectView,
    status: Exclude<LeadStatus, 'new'>,
  ): Promise<void> {
    try {
      await this.leads.changeStatus(prospect.subjectId, { status });
      this.notify.success('Lead mis à jour.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
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
