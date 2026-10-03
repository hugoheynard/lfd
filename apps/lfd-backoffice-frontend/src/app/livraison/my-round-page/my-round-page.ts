import { Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  DeliveryIncidentFamily,
  MyDeliveryRoundSummaryView,
  MyDeliveryRoundView,
  MyDeliveryStopView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { parisTimeOf } from '../delivery-loading';
import { incidentCountLabel } from '../delivery-incidents';
import { IncidentList } from '../incident-list/incident-list';
import type { IncidentPhotoLoader } from '../incident-photo/incident-photo';
import {
  type CurrentStopRef,
  IncidentReportForm,
} from '../incident-report-form/incident-report-form';
import { roundLabel, stopCountLabel } from '../delivery-rounds';
import {
  goToHref,
  NAVIGATION_APPS,
  type NavigationApp,
  placeOf,
  readNavigationApp,
  remainingStops,
  routeLegs,
  writeNavigationApp,
} from '../my-round-navigation';
import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { allStopsReady, readyStopsLabel } from '../my-round-packing';
import { MyRoundStop } from '../my-round-stop/my-round-stop';
import { parisDayOf } from '../run-sheet';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rounds: readonly MyDeliveryRoundSummaryView[] };

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly round: MyDeliveryRoundView };

/** Le stockage de l'appareil, ou rien : un navigateur qui le refuse ne casse pas la page. */
function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * **Ma tournée** — la page du livreur (`documentation/livraisons/plan-ma-tournee.md`,
 * MT-D7 ; navigation `plan-y-aller-et-position.md`, YA2). Pensée téléphone
 * d'abord : une colonne, de grands boutons.
 *
 * Aujourd'hui seulement : une tournée s'ouvre d'elle-même, plusieurs se
 * choisissent. Au dépôt, « Commencer ma tournée » ; partie, les liens de
 * navigation. Un refus du serveur s'affiche tel quel — il est écrit pour le
 * livreur (MT-D3 v2) — et la tournée est relue.
 *
 * **À la porte** (`plan-a-la-porte.md`, lot A ; `parcours-du-livreur.md`,
 * PL2) : partie et non rentrée, sous `delivery_doorstep:write`, la tournée
 * offre « Je suis arrivé », « Déclarer un problème », « Clore sans remise » et
 * « Tournée terminée ». Rentrée, elle le dit et n'offre plus aucun geste.
 *
 * **Elle suit le colisage** (`parcours-du-livreur.md`, PL4) : « n arrêts
 * prêts sur m » en tête, l'avancement et la fiche sur chaque arrêt. Comme les
 * postes du fournil, elle interroge la version de « ma tournée » et ne relit
 * que si elle a bougé (`DayVersionWatcher`).
 *
 * **Charger** (PL1) : au dépôt, « Charger » ouvre le chargement de SA tournée
 * dans la page — le même écran que celui du dépôt, par la porte du livreur.
 */
@Component({
  selector: 'app-my-round-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    IncidentList,
    IncidentReportForm,
    MyRoundStop,
  ],
  templateUrl: './my-round-page.html',
  styleUrl: './my-round-page.scss',
})
export class MyRoundPage {
  private readonly service = inject(MyDeliveryRoundService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly storage = deviceStorage();

  private readonly today = parisDayOf(new Date());

  protected readonly list = signal<ListState>({ status: 'loading' });
  protected readonly selected = signal<string | null>(null);
  protected readonly detail = signal<RoundState>({ status: 'loading' });

  /** Le dernier refus du serveur — la tournée reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly app = signal<NavigationApp>(readNavigationApp(this.storage));
  protected readonly appOptions: readonly FoldViewToggleOption[] = NAVIGATION_APPS;

  protected readonly rounds = computed(() => {
    const list = this.list();
    return list.status === 'ready' ? list.rounds : [];
  });

  /** Plusieurs tournées aujourd'hui : on peut revenir au choix. */
  protected readonly canGoBack = computed(() => this.rounds().length > 1);

  protected readonly round = computed(() => {
    const detail = this.detail();
    return detail.status === 'ready' ? detail.round : null;
  });
  protected readonly departed = computed(() => (this.round()?.departedAt ?? null) !== null);
  /** Rentrée le (PL2) : plus aucun geste n'est accepté, l'écran n'en offre plus. */
  protected readonly returnedAt = computed(() => this.round()?.returnedAt ?? null);
  /** En route : partie, pas encore rentrée. */
  protected readonly rolling = computed(() => this.departed() && this.returnedAt() === null);
  /** Les gestes à la porte : en route, et le droit tenu. */
  protected readonly gestures = computed(
    () => this.rolling() && this.permissions.can('delivery_doorstep:write'),
  );
  /** Un problème de la tournée est en cours de saisie. */
  protected readonly reportingRound = signal(false);
  protected readonly roundFamilies: readonly DeliveryIncidentFamily[] = ['technical', 'road'];
  protected readonly remaining = computed(() => remainingStops(this.round()?.stops ?? []));
  protected readonly legs = computed(() => routeLegs(this.remaining()));
  /**
   * Les arrêts sans sort, nommés — « Tournée terminée » les refusera
   * (`plan-a-la-porte.md`, § 10 B4) : le dire avant le clic. Tout sort ferme
   * l'arrêt, donc ce sont les arrêts encore ouverts. `null` : aucun.
   */
  protected readonly withoutOutcome = computed(() => {
    const open = this.remaining();
    return open.length === 0
      ? null
      : open.map((stop) => `${String(stop.rank)}. ${stop.customerLabel}`).join(', ');
  });
  /** L'arrêt suivant : le premier encore ouvert, dans l'ordre de passage. */
  protected readonly nextStop = computed(() => this.remaining()[0] ?? null);
  protected readonly currentStop = computed<CurrentStopRef | null>(() => {
    const next = this.nextStop();
    return next === null
      ? null
      : { stopId: next.stopId, label: `${String(next.rank)}. ${next.customerLabel}` };
  });
  /** La photo d'un signalement, par la route murée de MA tournée. */
  protected readonly incidentPhoto = computed<IncidentPhotoLoader>(() => {
    const roundId = this.round()?.id ?? '';
    return (incidentId) => this.service.incidentPhoto(roundId, incidentId);
  });
  /** Ce qui reste et ne peut entrer dans aucun lien : ni point ni adresse. */
  protected readonly unplaced = computed(
    () => this.remaining().filter((stop) => placeOf(stop) === null).length,
  );
  /** « Rentrer » : partie, plus rien à faire, et un point de départ connu. */
  protected readonly homeHref = computed(() => {
    const home = this.round()?.home ?? null;
    return this.rolling() && this.remaining().length === 0 && home !== null
      ? goToHref(this.app(), home)
      : null;
  });

  /** « Charger » : au dépôt seulement — partie, la tournée est gelée. */
  protected readonly canOpenLoading = computed(() => this.round() !== null && !this.departed());

  protected readonly roundLabel = roundLabel;
  protected readonly readyStopsLabel = readyStopsLabel;
  protected readonly allStopsReady = allStopsReady;
  protected readonly stopCountLabel = stopCountLabel;
  protected readonly timeOf = parisTimeOf;
  protected readonly incidentCountLabel = incidentCountLabel;

  constructor() {
    void this.loadList();
    // Le coliseur déclare, le fournil marque prête : sans relecture, le
    // livreur partirait sur un « en préparation » périmé. On ne relit que si
    // la version de « ma tournée » a bougé (PL4).
    inject(DayVersionWatcher).watch({
      journals: ['my-round'],
      date: () => this.today,
      reload: () => this.refresh(),
    });
  }

  protected goToOf(stop: MyDeliveryRoundView['stops'][number]): string | null {
    return this.rolling() ? goToHref(this.app(), stop) : null;
  }

  protected pickApp(value: string): void {
    const app = NAVIGATION_APPS.find((option) => option.value === value)?.value;
    if (app !== undefined) {
      this.app.set(app);
      writeNavigationApp(this.storage, app);
    }
  }

  protected open(roundId: string): void {
    this.selected.set(roundId);
    this.refusal.set(null);
    void this.loadRound(roundId);
  }

  protected back(): void {
    this.selected.set(null);
    this.refusal.set(null);
  }

  protected retryList(): void {
    void this.loadList();
  }

  protected retryRound(): void {
    const id = this.selected();
    if (id !== null) {
      void this.loadRound(id);
    }
  }

  /** « Commencer ma tournée » — avec la version lue ; relue après, refusée ou non. */
  protected async depart(): Promise<void> {
    const round = this.round();
    if (round === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.service.depart(round.id, { version: round.version });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La tournée n’a pas pu commencer.'));
    }
    // Relire dans les deux cas : partie, elle montre ses liens ; refusée, sa
    // version a peut-être changé au dépôt.
    await this.loadRound(round.id);
    this.busy.set(false);
  }

  /** « Je suis arrivé » sur l'arrêt suivant. */
  protected arrive(stop: MyDeliveryStopView): Promise<void> {
    return this.gesture(
      (round) => this.service.arrive(round.id, stop.stopId),
      'L’arrivée n’a pas pu être enregistrée.',
    );
  }

  /** Clore sans remise, avec la version lue : une tournée changée entre-temps est refusée. */
  protected closeWithoutHandover(stop: MyDeliveryStopView): Promise<void> {
    return this.gesture(
      (round) =>
        this.service.closeWithoutHandover(round.id, stop.stopId, { version: round.version }),
      'L’arrêt n’a pas pu être clos.',
    );
  }

  /** « Tournée terminée » (PL2) — confirmée dans la page, jamais par `confirm()`. */
  protected returnToDepot(): Promise<void> {
    return this.gesture(
      (round) => this.service.returnToDepot(round.id),
      'La tournée n’a pas pu être déclarée rentrée.',
    );
  }

  /**
   * « Charger » : le chargement a sa propre adresse, sous la tournée — un
   * rechargement de la page la rouvre, et le retour relit « Ma tournée ».
   */
  protected openLoading(roundId: string): void {
    void this.router.navigate(['/coursier', roundId, 'chargement']);
  }

  /** Un signalement est enregistré : on referme, on relit (il paraît dans la liste). */
  protected onRoundReported(): void {
    this.reportingRound.set(false);
    this.retryRound();
  }

  /**
   * Un geste à la porte : refusé, le message du serveur s'affiche tel quel ;
   * dans les deux cas la tournée est relue.
   */
  private async gesture(
    write: (round: MyDeliveryRoundView) => Promise<void>,
    fallback: string,
  ): Promise<void> {
    const round = this.round();
    if (round === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await write(round);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    }
    await this.loadRound(round.id);
    this.busy.set(false);
  }

  /**
   * La version a bougé : relire ce qui est à l'écran, sans repasser par
   * « chargement » ni rouvrir d'office — le livreur garde sa place. Ne rejette
   * pas : un échec garde l'écran d'avant, le tick suivant réessaiera.
   */
  private async refresh(): Promise<void> {
    const id = this.selected();
    if (id !== null) {
      await this.loadRound(id);
      return;
    }
    if (this.list().status !== 'ready') {
      return;
    }
    try {
      const { rounds } = await this.service.mine(this.today);
      if (this.selected() === null) {
        this.list.set({ status: 'ready', rounds });
      }
    } catch {
      // L'écran d'avant reste : le tick suivant reposera la question.
    }
  }

  private async loadList(): Promise<void> {
    this.list.set({ status: 'loading' });
    try {
      const { rounds } = await this.service.mine(this.today);
      this.list.set({ status: 'ready', rounds });
      const [only] = rounds;
      if (rounds.length === 1 && only !== undefined) {
        this.open(only.id);
      }
    } catch {
      this.list.set({ status: 'error' });
    }
  }

  private async loadRound(roundId: string): Promise<void> {
    // Une relecture de la même tournée la garde à l'écran.
    const current = this.detail();
    if (current.status !== 'ready' || current.round.id !== roundId) {
      this.detail.set({ status: 'loading' });
    }
    try {
      const round = await this.service.round(roundId);
      if (this.selected() === roundId) {
        this.detail.set({ status: 'ready', round });
      }
    } catch {
      if (this.selected() === roundId) {
        this.detail.set({ status: 'error' });
      }
    }
  }
}
