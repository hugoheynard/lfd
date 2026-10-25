import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  type FoldTableColumn,
  type FoldTableEmpty,
} from 'fold-ng';
import type { ActiveLeadStatus, LeadStatus, ProspectView } from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { LeadsService } from '../leads.service';
import { LeadCapturePanel } from './lead-capture-panel/lead-capture-panel';
import { Chart, type ChartOption } from '../../shared/chart/chart';
import { funnelOption } from '../../analytics/croissance/growth-charts';
import { GrowthService } from '../../analytics/croissance/growth.service';
import { actionsFor, LEAD_STAGE, type BadgeVariant, type LeadAction } from './lead-stage';
import { ProspectsService } from './prospects.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Onglet **Prospects** (commercial) : les établissements **démarchés** qui ne
 * sont pas encore clients — le carnet du commercial, lu via
 * `GET /admin/prospects`. L'étape se fait avancer depuis la ligne ; le bouton
 * **Ajouter un établissement démarché** ouvre le panneau de saisie.
 *
 * Jusqu'au lot P3 (2026-10-25, `documentation/b2b/plan-auto-acquisition-pro.md`),
 * la page mêlait des personnes « chaudes » et « tièdes » venues du journal —
 * des particuliers — et un étage « Activation » des comptes en cours
 * d'ouverture, qui vit désormais dans Comptes clients.
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

  /** L'entonnoir du démarchage — la seule vue qui dise OÙ ça se perd. */
  protected readonly funnel = signal<ChartOption | null>(null);

  protected readonly columns: readonly FoldTableColumn[] = [
    { key: 'businessName', label: 'Établissement' },
    { key: 'contactName', label: 'Contact' },
    { key: 'phone', label: 'Téléphone', width: '10rem' },
    { key: 'email', label: 'E-mail' },
    { key: 'status', label: 'Étape', width: '9rem' },
    { key: 'capturedAt', label: 'Depuis', width: '7rem', align: 'right' },
    { key: 'actions', label: '', width: '3rem' },
  ];

  protected readonly count = computed(() => this.prospects().length);

  protected readonly emptyState = computed<FoldTableEmpty>(() => ({
    title: 'Aucun établissement démarché',
    subtitle:
      'Ajoutez un établissement rencontré ou appelé : il reste ici jusqu’à ce qu’il devienne client ou soit perdu.',
  }));

  protected readonly rowKey = (prospect: ProspectView): string => prospect.leadId;

  constructor() {
    void this.load();
    void this.loadFunnel();
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

  /** Best-effort : un entonnoir absent ne doit pas priver de la liste. */
  private async loadFunnel(): Promise<void> {
    try {
      const stats = await this.growth.stats();
      this.funnel.set(funnelOption(stats.coldFunnel, '#64748b'));
    } catch {
      this.funnel.set(null);
    }
  }

  protected actionsOf(prospect: ProspectView): readonly LeadAction[] {
    return actionsFor(prospect.status);
  }

  protected stageOf(status: ActiveLeadStatus): { label: string; variant: BadgeVariant } {
    return LEAD_STAGE[status];
  }

  /** Applique une transition au lead, puis recharge la file. */
  protected async advance(
    prospect: ProspectView,
    status: Exclude<LeadStatus, 'new'>,
  ): Promise<void> {
    try {
      await this.leads.changeStatus(prospect.leadId, { status });
      this.notify.success('Établissement mis à jour.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  /** Ouvre le panneau de saisie ; recharge la file si un établissement a été ajouté. */
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

  /** Une coordonnée absente se dit par un tiret, pas par une cellule vide. */
  protected orDash(value: string): string {
    return value === '' ? '—' : value;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
