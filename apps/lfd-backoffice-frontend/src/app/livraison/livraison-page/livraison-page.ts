import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeliveryRunSheetView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DayVersionWatcher } from '../../shared/day-version/day-version-watcher';
import { ordersFromOtherDays } from '../delivery-rounds';
import { DeliveryRoundsService } from '../delivery-rounds.service';
import { headlineOf, longDayOf, sortStops, summaryOf } from '../run-sheet';
import { RunSheetService } from '../run-sheet.service';
import { RunSheetStop } from '../run-sheet-stop/run-sheet-stop';
import { TourManagerDay } from '../tour-manager/tour-manager-day';

type SheetState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly day: string; readonly view: DeliveryRunSheetView };

/**
 * **La feuille de route du jour** — ce qui part en livraison, et comment livrer
 * chaque adresse (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 1).
 *
 * Lecture seule, **aucun montant** : un total ici se lirait comme une somme à
 * encaisser à la porte. Le jour par défaut est **demain** — la tournée se
 * prépare la veille. Les arrêts sont triés par fenêtre ; ce que le serveur ne
 * sait pas (adresse non reliée au carnet, commande sans feuille d'atelier) se
 * dit en toutes lettres plutôt que de laisser un trou muet.
 *
 * Les photos de procédure se lisent par la route de la fiche client, sous
 * `delivery_procedures:read`. Sans ce droit, le serveur sert la procédure vide
 * (`plan-droits-par-geste.md`, DG-D8) — ni texte ni photo — et l'écran ne tente
 * pas une lecture qui serait refusée.
 *
 * Le jour est celui du bandeau de Tour manager (`TourManagerDay`), commun aux
 * deux onglets depuis le 2026-10-26 : la page ne le choisit plus, elle le lit.
 * Imprimable : le bouton disparaît sur papier, le jour reste dit.
 */
@Component({
  selector: 'app-livraison-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    RouterLink,
    RunSheetStop,
  ],
  templateUrl: './livraison-page.html',
  styleUrl: './livraison-page.scss',
})
export class DeliveryPage {
  private readonly service = inject(RunSheetService);
  private readonly rounds = inject(DeliveryRoundsService);
  private readonly permissions = inject(PermissionsStore);

  /** Le jour du bandeau de Tour manager, commun aux deux onglets. */
  protected readonly day = inject(TourManagerDay).day;

  protected readonly state = signal<SheetState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });
  protected readonly stops = computed(() => sortStops(this.view()?.stops ?? []));
  protected readonly summary = computed(() => {
    const view = this.view();
    return view === null ? null : summaryOf(view);
  });
  protected readonly longDay = computed(() => longDayOf(this.day()));
  protected readonly headline = computed(() => {
    const summary = this.summary();
    return summary === null ? '' : headlineOf(summary);
  });
  /** Le lien « Tournées » ne s'offre qu'à qui peut les ouvrir. */
  protected readonly canSeeRounds = computed(() => this.permissions.can('delivery_rounds:read'));
  protected readonly canSeePhotos = computed(() =>
    this.permissions.can('delivery_procedures:read'),
  );

  /** Un numéro par lecture : une réponse lente d'un autre jour n'écrase pas la bonne. */
  private request = 0;

  constructor() {
    effect(() => {
      const day = this.day();
      this.reload();
      untracked(() => void this.load(day));
    });
    // Ne relire que si la journée de la livraison a bougé (`plan-version-par-journee.md`,
    // D4) — et seulement si le poste peut lire sa version : la feuille s'ouvre
    // sous `delivery_run_sheet`, la porte de la version sous les tournées ou le
    // chargement. Sans elle, la page garde son comportement d'avant.
    if (this.canReadDeliveryVersion()) {
      inject(DayVersionWatcher).watch({
        journals: ['delivery'],
        date: () => this.day(),
        reload: () => this.load(this.day()),
      });
    }
  }

  private canReadDeliveryVersion(): boolean {
    return (
      this.permissions.can('delivery_rounds:read') || this.permissions.can('delivery_loading:read')
    );
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  protected print(): void {
    window.print();
  }

  private async load(day: string): Promise<void> {
    const request = ++this.request;
    // Une relecture du même jour garde la feuille à l'écran.
    const current = this.state();
    if (current.status !== 'ready' || current.day !== day) {
      this.state.set({ status: 'loading' });
    }
    try {
      // Sans le droit, aucune attente de plus : la page lit comme avant.
      const also = this.permissions.can('delivery_rounds:read')
        ? await this.ordersFromOtherDays(day)
        : [];
      const view = await this.service.day(day, also);
      if (request === this.request) {
        this.state.set({ status: 'ready', day, view });
      }
    } catch {
      if (request === this.request) {
        this.state.set({ status: 'error' });
      }
    }
  }

  /**
   * Les commandes d'un autre jour demandé que la composition a placées ce
   * jour-là (rapportées, `decisions-par-defaut-2026-10-02.md`, § 4) — même
   * geste que l'écran des tournées, sans canal de plus.
   *
   * Appelée seulement sous `delivery_rounds:read` (le droit de
   * `GET admin/delivery/rounds`) : sans lui, la page ne lit pas la composition et garde son comportement d'avant : la
   * feuille du jour seule, sans ces commandes. Une composition illisible
   * (réseau, 5xx) dégrade de même plutôt que de priver la page de sa feuille.
   */
  private async ordersFromOtherDays(day: string): Promise<readonly string[]> {
    try {
      return ordersFromOtherDays(await this.rounds.day(day));
    } catch {
      return [];
    }
  }
}
