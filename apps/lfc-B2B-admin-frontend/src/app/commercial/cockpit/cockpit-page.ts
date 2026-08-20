import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalendarDayComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  foldToday,
  type FoldCalendarDate,
} from 'fold-ng';
import type {
  AppointmentView,
  GrowthStatsView,
  LeadScoreView,
  OrderMetricsView,
} from '@lfd/contracts';
import type { SupportRequestView } from '@lfd/contracts';

import type { AdminCompany } from '../../comptes-clients/admin-company';
import { NotifyService } from '../../notify.service';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { Chart, type ChartOption } from '../../shared/chart/chart';
import { AvailabilityService } from '../availability/availability.service';
import { buildAppointmentEvents, type AppointmentEvent } from '../calendrier/appointment-events';
import { sparklineOption } from '../../analytics/croissance/growth-charts';
import { GrowthService } from '../../analytics/croissance/growth.service';
import { SupportService } from '../support/support.service';
import { SupportQueue } from '../support/support-queue/support-queue';
import { CockpitService } from './cockpit.service';
import { PinnedAccounts, type SheetsById } from './pinned-accounts/pinned-accounts';
import { PinnedAccountsStore, MAX_METRICS } from './pinned-store';
import { CustomerSheetService } from '../calendrier/customer-sheet/customer-sheet.service';
import { PlayQueue } from './play-queue/play-queue';
import { RevenuePaceCard } from './revenue-pace/revenue-pace';

type LoadState = 'loading' | 'ready' | 'error';

/** Une tuile de l'en-tête : un chiffre, ce qu'il compte. */
interface Kpi {
  readonly label: string;
  readonly value: string;
}

/**
 * **Tableau de bord commercial** — ce qu'il faut avoir sous les yeux en arrivant :
 * la journée, les gens qui attendent, et les coups à jouer.
 *
 * Trois blocs, dans l'ordre où on s'en sert :
 * - **la journée** — les rendez-vous du jour, en calendrier, cliquables. C'est ce
 *   qui a une heure : ça passe avant ce qui n'en a pas ;
 * - **à rappeler** — les demandes de contact ouvertes, avec le bouton qui les
 *   clôt. Cette file existait côté API depuis la reprise du `SupportRequest` et
 *   n'avait aucun écran : une demande tombait dans un trou ;
 * - **les coups du jour** — la file scorée, inchangée dans son fond.
 *
 * Les **comptes épinglés** ouvrent la page : ce sont les clients qu'on suit de
 * près, et on veut voir leur état avant de décider de sa journée.
 *
 * `today` est posé **après le premier rendu** (navigateur) : fold n'a pas
 * d'horloge et un SSR ne doit pas en inventer une, sinon l'hydratation diverge.
 */
@Component({
  selector: 'app-cockpit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chart,
    FoldButtonComponent,
    FoldCalendarDayComponent,
    PinnedAccounts,
    PlayQueue,
    RevenuePaceCard,
    RouterLink,
    SupportQueue,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './cockpit-page.html',
  styleUrl: './cockpit-page.scss',
})
export class CockpitPage {
  private readonly cockpit = inject(CockpitService);
  private readonly growth = inject(GrowthService);
  private readonly appointmentsApi = inject(AvailabilityService);
  private readonly supportApi = inject(SupportService);
  private readonly companiesApi = inject(AdminCompaniesService);
  private readonly pins = inject(PinnedAccountsStore);
  private readonly sheetsApi = inject(CustomerSheetService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly leads = signal<readonly LeadScoreView[]>([]);
  protected readonly stats = signal<GrowthStatsView | null>(null);
  protected readonly requests = signal<readonly SupportRequestView[]>([]);
  protected readonly orderMetrics = signal<OrderMetricsView | null>(null);
  private readonly appointments = signal<readonly AppointmentView[]>([]);
  private readonly companies = signal<readonly AdminCompany[]>([]);
  /** Les fiches des comptes suivis QUI demandent un indicateur — pas les autres. */
  protected readonly sheets = signal<SheetsById>(new Map());

  /** Le jour courant, posé au 1er rendu navigateur — `undefined` en SSR. */
  protected readonly today = signal<FoldCalendarDate | undefined>(undefined);
  /** Le même instant, en `Date` — ce dont l'allure du mois a besoin. */
  protected readonly now = signal<Date | undefined>(undefined);

  /** Les rendez-vous projetés — vides tant que `today` n'est pas posé (donc en SSR). */
  protected readonly events = computed<readonly AppointmentEvent[]>(() =>
    this.today() === undefined ? [] : buildAppointmentEvents(this.appointments()),
  );

  /** Combien de rendez-vous aujourd'hui — le chiffre qui titre le rail. */
  protected readonly todayCount = computed<number>(() => {
    const day = this.today();
    return day === undefined ? 0 : this.events().filter((event) => event.start === day).length;
  });

  /** Les épinglés, dans l'ordre des épingles — pas dans celui de la liste serveur. */
  protected readonly pinnedCompanies = computed<readonly AdminCompany[]>(() => {
    const byId = new Map(this.companies().map((company) => [company.id, company]));
    return this.pins
      .pinned()
      .map((account) => byId.get(account.companyId))
      .filter((company): company is AdminCompany => company !== undefined);
  });

  protected readonly kpis = computed<readonly Kpi[]>(() => {
    const stats = this.stats();
    if (stats === null) {
      return [];
    }
    const k = stats.kpis;
    return [
      { label: 'Prospects', value: `${k.prospects}` },
      { label: 'Chauds', value: `${k.hot}` },
      { label: 'Commandes', value: `${k.orders}` },
      { label: 'Conversion', value: `${Math.round(k.conversionRate * 100)} %` },
    ];
  });

  protected readonly spark = computed<ChartOption | null>(() => {
    const stats = this.stats();
    return stats === null ? null : sparklineOption(stats.acquisition);
  });

  /** Fraîcheur du read-model scoré — il vient d'un cron, pas du temps réel. */
  protected readonly computedAt = computed<string | null>(
    () => this.leads()[0]?.computedAt ?? null,
  );

  constructor() {
    afterNextRender(() => {
      this.today.set(foldToday());
      this.now.set(new Date());
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.leads.set(await this.cockpit.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
      return;
    }
    // Le reste est **accessoire** : un rail vide ne doit pas casser le tableau
    // de bord, dont la file scorée est le cœur.
    await Promise.all([
      this.loadInto(this.stats, () => this.growth.stats(), null),
      this.loadInto(this.orderMetrics, () => this.growth.orderMetrics(), null),
      this.loadInto(this.requests, () => this.supportApi.list(), []),
      this.loadInto(this.appointments, () => this.dayAppointments(), []),
      this.loadInto(this.companies, () => this.companiesApi.list(), []),
      this.loadSheets(),
    ]);
  }

  /** Clôt une demande, puis la retire de la file — optimiste, rechargé ensuite. */
  protected async handleRequest(id: string): Promise<void> {
    try {
      await this.supportApi.handle(id);
    } finally {
      this.requests.set(await this.safe(() => this.supportApi.list(), this.requests()));
    }
  }

  protected readonly accounts = computed(() => this.pins.pinned());

  protected unpin(companyId: string): void {
    this.pins.toggle(companyId);
    void this.loadSheets();
  }

  /** Ajoute un indicateur, et charge la fiche si c'est le premier de la carte. */
  protected async addMetric(request: { companyId: string; metric: string }): Promise<void> {
    if (!this.pins.addMetric(request.companyId, request.metric)) {
      this.notify.error(`Maximum ${MAX_METRICS} indicateurs par carte — retirez-en un d'abord.`);
      return;
    }
    await this.loadSheets();
  }

  protected removeMetric(request: { companyId: string; metric: string }): void {
    this.pins.removeMetric(request.companyId, request.metric);
  }

  /**
   * Les fiches des seuls comptes qui affichent un indicateur. Une carte sans
   * indicateur ne coûte donc aucune requête — et il y en a au plus six.
   */
  private async loadSheets(): Promise<void> {
    const wanted = this.pins.pinned().filter((account) => account.metrics.length > 0);
    const loaded = new Map(this.sheets());
    const missing = wanted.filter((account) => !loaded.has(account.companyId));
    const fetched = await Promise.all(
      missing.map((account) =>
        this.safe(() => this.sheetsApi.sheet(account.companyId), null).then(
          (sheet) => [account.companyId, sheet] as const,
        ),
      ),
    );
    for (const [companyId, sheet] of fetched) {
      if (sheet !== null) {
        loaded.set(companyId, sheet);
      }
    }
    this.sheets.set(loaded);
  }

  /** Ouvre la page du rendez-vous : c'est là qu'on travaille, pas dans le rail. */
  protected async openEvent(event: AppointmentEvent): Promise<void> {
    const appointment = this.appointments().find((a) => `appt:${a.id}` === event.id);
    if (appointment !== undefined) {
      await this.router.navigate(['/rendez-vous', appointment.id]);
    }
  }

  protected freshnessLabel(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Les rendez-vous d'aujourd'hui, bornés à la journée — le rail n'en montre pas plus. */
  private dayAppointments(): Promise<readonly AppointmentView[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return this.appointmentsApi.appointments(start.toISOString(), end.toISOString());
  }

  /** Charge dans un signal, en retombant sur une valeur sûre plutôt qu'en cassant. */
  private async loadInto<T>(
    target: { set: (value: T) => void },
    read: () => Promise<T>,
    fallback: T,
  ): Promise<void> {
    target.set(await this.safe(read, fallback));
  }

  private async safe<T>(read: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await read();
    } catch {
      return fallback;
    }
  }
}
