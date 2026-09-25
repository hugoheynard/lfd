import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { instantToLocal } from '@lfd/contracts';
import type {
  DaySupervisionView,
  FulfillmentMethod,
  LateOrder,
  SupervisionFlow,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { refreshWhileVisible } from '../../shared/periodic-refresh';
import {
  asOfLabel,
  FLOW_STAGES,
  type FlowStage,
  methodLabel,
  ruleLabel,
  stageLabel,
  undatedLabel,
  windowLabel,
} from '../supervision-labels';
import { SupervisionService } from '../supervision.service';

/** L'étape cliquée : elle filtre la liste des retards. */
export interface StageFilter {
  readonly method: FulfillmentMethod;
  readonly stage: FlowStage;
}

/** Une case du flux, prête à l'affichage. */
interface StageCell {
  readonly stage: FlowStage;
  readonly label: string;
  readonly count: number;
  readonly late: number;
  readonly selected: boolean;
}

/** Une ligne de flux : un acheminement, ses étapes, ses annulées. */
interface FlowRow {
  readonly method: FulfillmentMethod;
  readonly title: string;
  readonly icon: 'store' | 'truck';
  readonly cancelled: string;
  readonly cells: readonly StageCell[];
}

/** Les deux acheminements, toujours affichés — une ligne vide dit « rien », pas « oubli ». */
const METHODS: readonly FulfillmentMethod[] = ['pickup', 'delivery'];

const EMPTY_FLOW = { placed: 0, inProduction: 0, ready: 0, handedOver: 0, cancelled: 0 };

function countOf(flow: SupervisionFlow | undefined, stage: FlowStage): number {
  const source = flow ?? EMPTY_FLOW;
  switch (stage) {
    case 'placed':
      return source.placed;
    case 'in_production':
      return source.inProduction;
    case 'ready':
      return source.ready;
    case 'handed_over':
      return source.handedOver;
  }
}

/** Aujourd'hui à Paris — la journée de service d'un poste ouvert à 23 h 30 UTC n'est pas celle d'UTC. */
function parisToday(): string {
  return instantToLocal(new Date()).day;
}

/**
 * **La Supervision du jour** — un écran scanné, pas lu : où en est chaque
 * commande d'une date de service, et lesquelles sont en retard.
 *
 * Il n'agit pas. Il renvoie vers l'écran de terrain, et seulement à qui en a le
 * droit : sans `b2b_orders:read`, une ligne n'est pas un lien — la Supervision
 * ne devient pas une porte dérobée vers la commande
 * (`documentation/order/plan-supervision-du-jour.md`, Front).
 */
@Component({
  selector: 'app-supervision-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './supervision-page.html',
  styleUrl: './supervision-page.scss',
})
export class SupervisionPage {
  private readonly service = inject(SupervisionService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly date = signal(parisToday());
  protected readonly view = signal<DaySupervisionView | null>(null);
  protected readonly loading = signal(true);
  /** Le PREMIER chargement a échoué : rien à montrer. */
  protected readonly loadFailed = signal(false);
  /** Une RELECTURE a échoué : la dernière vue reste, et l'écran le dit. */
  protected readonly refreshFailed = signal(false);
  protected readonly filter = signal<StageFilter | null>(null);

  /** Lu à chaque rendu : un droit accordé en cours de session ouvre les liens. */
  protected readonly canOpenOrders = computed(() => this.permissions.can('b2b_orders:read'));

  protected readonly asOf = computed(() => {
    const view = this.view();
    return view === null ? '' : asOfLabel(view.asOf);
  });

  protected readonly undated = computed(() => {
    const count = this.view()?.undated ?? 0;
    return count > 0 ? undatedLabel(count) : null;
  });

  protected readonly lateCount = computed(() => this.view()?.late.length ?? 0);

  protected readonly flows = computed<readonly FlowRow[]>(() => {
    const view = this.view();
    const selected = this.filter();
    return METHODS.map((method) => {
      const flow = view?.flow.find((entry) => entry.fulfillmentMethod === method);
      const late = view?.late.filter((order) => order.fulfillmentMethod === method) ?? [];
      const cancelled = flow?.cancelled ?? 0;
      return {
        method,
        title: methodLabel(method),
        icon: method === 'pickup' ? 'store' : 'truck',
        cancelled:
          cancelled === 0 ? '' : cancelled === 1 ? '1 annulée' : `${String(cancelled)} annulées`,
        cells: FLOW_STAGES.map((stage) => ({
          stage,
          label: stageLabel(stage, method),
          count: countOf(flow, stage),
          late: late.filter((order) => order.stage === stage).length,
          selected: selected?.method === method && selected.stage === stage,
        })),
      };
    });
  });

  /** Les retards, filtrés par l'étape cliquée s'il y en a une. */
  protected readonly lateOrders = computed<readonly LateOrder[]>(() => {
    const late = this.view()?.late ?? [];
    const selected = this.filter();
    return selected === null
      ? late
      : late.filter(
          (order) => order.fulfillmentMethod === selected.method && order.stage === selected.stage,
        );
  });

  protected readonly filterLabel = computed(() => {
    const selected = this.filter();
    return selected === null
      ? null
      : `${methodLabel(selected.method)} · ${stageLabel(selected.stage, selected.method)}`;
  });

  protected readonly ruleLabel = ruleLabel;
  protected readonly windowLabel = windowLabel;
  protected readonly methodLabel = methodLabel;

  constructor() {
    void this.load();
    refreshWhileVisible(() => this.refresh());
  }

  protected changeDate(date: string): void {
    if (date === '' || date === this.date()) {
      return;
    }
    this.date.set(date);
    this.filter.set(null);
    this.view.set(null);
    void this.load();
  }

  /** Un second clic sur la même étape retire le filtre. */
  protected toggleStage(method: FulfillmentMethod, stage: FlowStage): void {
    const current = this.filter();
    this.filter.set(
      current?.method === method && current.stage === stage ? null : { method, stage },
    );
  }

  protected clearFilter(): void {
    this.filter.set(null);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.refreshFailed.set(false);
    try {
      this.view.set(await this.service.day(this.date()));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** La relecture périodique : elle ne vide jamais l'écran, elle dit seulement qu'elle a échoué. */
  private async refresh(): Promise<void> {
    if (this.loading() || this.view() === null) {
      return;
    }
    const date = this.date();
    try {
      const view = await this.service.day(date);
      // La date a pu changer pendant la lecture : on ne pose pas hier sur aujourd'hui.
      if (date === this.date()) {
        this.view.set(view);
        this.refreshFailed.set(false);
      }
    } catch {
      this.refreshFailed.set(true);
    }
  }
}
