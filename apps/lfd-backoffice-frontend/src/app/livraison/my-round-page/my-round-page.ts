import { Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  DeliveryIncidentFamily,
  MyDeliveryRoundView,
  MyDeliveryStopView,
} from '@lfd/contracts';
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
  driveTargetOf,
  goToHref,
  NAVIGATION_APPS,
  type NavigationApp,
  placeOf,
  readNavigationApp,
  remainingStops,
  routeLegs,
  writeNavigationApp,
} from '../my-round-navigation';
import { GesturePositionReader } from '../gesture-position';
import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { allStopsReady, readyStopsLabel } from '../my-round-packing';
import { MyRoundStop } from '../my-round-stop/my-round-stop';
import { MyRoundGestures } from '../my-round-gestures';
import { MyRoundReader } from '../my-round-reader';

/** Le stockage de l'appareil, ou rien : un navigateur qui le refuse ne casse pas la page. */
function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * **Ma tournée** — la page du livreur (`documentation/livraisons/livreur/plan-ma-tournee.md`,
 * MT-D7 ; navigation `gps-y-aller-et-position.md`, YA2). Pensée téléphone
 * d'abord : une colonne, de grands boutons.
 *
 * Aujourd'hui seulement : une tournée s'ouvre d'elle-même, plusieurs se
 * choisissent. Au dépôt, « Commencer ma tournée » ; partie, les liens de
 * navigation. Un refus du serveur s'affiche tel quel — il est écrit pour le
 * livreur (MT-D3 v2) — et la tournée est relue.
 *
 * **À la porte** (`a-la-porte.md`, lot A ; `parcours-du-livreur.md`,
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
 *
 * **La position au geste** (`gps-y-aller-et-position.md`, YA-D4) : chaque
 * geste à la porte relève la position du téléphone, une fois ; indisponible,
 * le geste part sans elle et la page le dit (« position indisponible »).
 *
 * **Ses données** (`rgpd-livreur.md`, §7 point 2) : « Commencer ma tournée »
 * présente d'abord le texte d'information tant que sa version courante n'est
 * pas accusée (`DriverNoticeGate`) ; « Mes données » le relit à tout moment.
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
    RouterLink,
  ],
  templateUrl: './my-round-page.html',
  styleUrl: './my-round-page.scss',
})
export class MyRoundPage {
  private readonly service = inject(MyDeliveryRoundService);
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  /** La position au geste (YA-D4) : son absence se dit, elle ne bloque rien. */
  protected readonly positions = inject(GesturePositionReader);
  private readonly storage = deviceStorage();

  /** Le dernier refus du serveur — la tournée reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  /** Les tournées du jour et celle qu'on a choisie ; leurs signaux gardent leurs noms au gabarit. */
  private readonly reader = new MyRoundReader(this.refusal);
  /** Les gestes à la porte, qui relisent par le même lecteur. */
  private readonly doorstep = new MyRoundGestures(this.reader, this.refusal);
  private readonly today = this.reader.today;

  protected readonly list = this.reader.list;
  protected readonly selected = this.reader.selected;
  protected readonly detail = this.reader.detail;
  protected readonly busy = this.doorstep.busy;

  protected readonly app = signal<NavigationApp>(readNavigationApp(this.storage));
  protected readonly appOptions: readonly FoldViewToggleOption[] = NAVIGATION_APPS;

  protected readonly rounds = computed(() => {
    const list = this.list();
    return list.status === 'ready' ? list.rounds : [];
  });

  /** Plusieurs tournées aujourd'hui : on peut revenir au choix. */
  protected readonly canGoBack = computed(() => this.rounds().length > 1);

  protected readonly round = this.reader.round;
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
   * (`a-la-porte.md`, § 10 B4) : le dire avant le clic. Tout sort ferme
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
    () => this.remaining().filter((stop) => placeOf(driveTargetOf(stop)) === null).length,
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
    void this.reader.loadList();
    // Le coliseur déclare, le fournil marque prête : sans relecture, le
    // livreur partirait sur un « en préparation » périmé. On ne relit que si
    // la version de « ma tournée » a bougé (PL4).
    inject(DayVersionWatcher).watch({
      journals: ['my-round'],
      date: () => this.today,
      reload: () => this.reader.refresh(),
    });
  }

  protected goToOf(stop: MyDeliveryRoundView['stops'][number]): string | null {
    // Le stationnement d'abord, s'il est connu (§6) : on conduit là où l'on se gare.
    return this.rolling() ? goToHref(this.app(), driveTargetOf(stop)) : null;
  }

  protected pickApp(value: string): void {
    const app = NAVIGATION_APPS.find((option) => option.value === value)?.value;
    if (app !== undefined) {
      this.app.set(app);
      writeNavigationApp(this.storage, app);
    }
  }

  protected readonly open = (roundId: string): void => this.reader.open(roundId);
  protected readonly back = (): void => this.reader.back();
  protected readonly retryList = (): void => this.reader.retryList();
  protected readonly retryRound = (): void => this.reader.retryRound();

  protected readonly depart = (): Promise<void> => this.doorstep.depart();
  protected readonly arrive = (stop: MyDeliveryStopView): Promise<void> =>
    this.doorstep.arrive(stop);
  protected readonly closeWithoutHandover = (stop: MyDeliveryStopView): Promise<void> =>
    this.doorstep.closeWithoutHandover(stop);
  protected readonly returnToDepot = (): Promise<void> => this.doorstep.returnToDepot();

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
}
