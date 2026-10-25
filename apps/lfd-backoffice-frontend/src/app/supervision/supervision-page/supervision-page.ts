import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { FulfillmentMethod, WithdrawnPackingSheet } from '@lfd/contracts';
import type { FoldViewNavItem } from 'fold-ng';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSearchComponent,
  FoldSurfaceDirective,
  FoldViewNavComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CompositionGapsCallout } from '../../livraison/composition-gaps-callout/composition-gaps-callout';
import { narrowViewport } from '../../shared/viewport/narrow-viewport';
import { dataOf } from '../column-state';
import { handoverBoard } from '../handover-slots';
import { HandoverBand } from '../handover-band/handover-band';
import { HandoverColumn } from '../handover-column/handover-column';
import { ALL_POINTS, packingBoard } from '../packing-cards';
import { PackingBand } from '../packing-band/packing-band';
import { PackingColumn } from '../packing-column/packing-column';
import { PreparationBand } from '../preparation-band/preparation-band';
import { PreparationColumn } from '../preparation-column/preparation-column';
import { ALL_SHELVES, preparationBoard } from '../preparation-shelves';
import type { QualityRequest } from '../quality-badges';
import { qualityContextOf } from '../quality-context';
import { QualityBoardStore } from '../quality-board.store';
import { ReserveShopLauncher } from '../reserve-shop-panel/reserve-shop-launcher';
import { SupervisionCalendar } from '../supervision-calendar/supervision-calendar';
import { SupervisionColumn } from '../supervision-column/supervision-column';
import { dayDiff, dayStripOf, serviceDayParam, shiftServiceDay, stampOf } from '../supervision-day';
import { SupervisionHighlight } from '../supervision-highlight';
import { SupervisionReads } from '../supervision-reads';
import { lateSkusOf } from '../supervision-search';
import { scrollToHits } from '../supervision-hits';
import {
  landingColumnOf,
  LINK_PERMISSIONS,
  type SupervisionColumn as Column,
} from '../supervision-links';
import { DAY_REFRESH_MS, watchSupervisionDay } from '../supervision-refresh';
import { SupervisionService } from '../supervision.service';
import { StockBoard, SUPERVISION_VIEWS, type SupervisionView } from '../stock-board/stock-board';
import {
  blockersOf,
  columnBlockersOf,
  columnSubtitlesOf,
  countersOf,
  DAY_OPTIONS,
  supervisionTabs,
} from '../supervision-tabs';

/**
 * En dessous, une colonne à la fois (plan §6). 900 px et non le seuil commun
 * de 640 : trois colonnes de cartes ne tiennent pas lisiblement sur une
 * tablette en portrait — c'est le pli des dialogues de la boutique.
 */
const BOARD_NARROW = '(max-width: 900px)';

/**
 * **La Supervision du jour** — on voit, on n'agit pas (doc d'état
 * `architecture-supervision-du-jour.md`).
 *
 * Trois colonnes dont l'unité change — le rayon, la commande, le créneau —,
 * chacune servie par sa propre lecture sous `b2b_supervision:read`, avec son
 * propre état : une lecture qui échoue n'efface pas les autres. Le jour est
 * celui du SERVEUR ; on peut en regarder un autre (`?date=`), et un bandeau le
 * dit. La mise en avant (recherche, pastille, commande dépliée) vit dans
 * `SupervisionHighlight` ; la page ne fait que la brancher et faire défiler.
 */
@Component({
  selector: 'app-supervision-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CompositionGapsCallout,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
    FoldViewNavComponent,
    FoldViewToggleComponent,
    HandoverColumn,
    NgTemplateOutlet,
    HandoverBand,
    PackingBand,
    PackingColumn,
    PreparationBand,
    PreparationColumn,
    SupervisionCalendar,
    SupervisionColumn,
    StockBoard,
  ],
  providers: [QualityBoardStore],
  templateUrl: './supervision-page.html',
  styleUrl: './supervision-page.scss',
})
export class SupervisionPage {
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Les pastilles du contrôle qualité et son panneau (`plan-controle-qualite.md`). */
  protected readonly quality = inject(QualityBoardStore);
  /** « Envoyer en boutique » le pain rendu par une annulation (plan A1, lot A1.4). */
  protected readonly reserveShop = inject(ReserveShopLauncher);

  /** Le jour choisi à l'écran, ou `null` : on suit le jour du serveur. */
  protected readonly chosen = signal(
    serviceDayParam(inject(ActivatedRoute).snapshot.queryParamMap.get('date')),
  );

  protected readonly narrow = narrowViewport(BOARD_NARROW);
  /** Les quatre lectures et leurs états — le jour, puis les trois colonnes. */
  protected readonly reads = new SupervisionReads(inject(SupervisionService), this.quality, () =>
    this.chosen(),
  );
  protected readonly date = this.reads.date;
  protected readonly serverDay = this.reads.serverDay;
  protected readonly day = this.reads.day;
  protected readonly preparation = this.reads.preparation;
  protected readonly packing = this.reads.packing;
  protected readonly handover = this.reads.handover;

  /** Journée (les trois colonnes) ou Stock (lot S1) ; le jour choisi vaut pour les deux. */
  protected readonly view = signal<SupervisionView>('day');
  protected readonly viewOptions = SUPERVISION_VIEWS;

  /** Le rôle choisit l'onglet d'arrivée ; le dernier ouvert ne l'emporte pas. */
  protected readonly tab = signal<Column>(
    landingColumnOf(this.permissions.identity()?.role ?? null),
  );

  /**
   * Lu à chaque rendu : un droit accordé en cours de session ouvre les renvois.
   * Par colonne — chaque cible a son droit depuis le 2026-10-01.
   */
  protected readonly showLinks = computed(() => ({
    preparation: this.permissions.can(LINK_PERMISSIONS.preparation),
    packing: this.permissions.can(LINK_PERMISSIONS.packing),
    handover: this.permissions.can(LINK_PERMISSIONS.handover),
  }));

  /** Le manque de flotte, au bandeau : à qui lit les tournées, et à lui seul (2026-10-22). */
  protected readonly showCompositionGaps = computed(() =>
    this.permissions.can('delivery_rounds:read'),
  );

  protected readonly preparationBoard = computed(() => {
    const view = dataOf(this.preparation());
    return view === null ? null : preparationBoard(view);
  });

  protected readonly lateSkus = computed(() =>
    lateSkusOf(dataOf(this.packing()), this.handoverBoard()),
  );

  protected readonly packingBoard = computed(() => {
    const view = dataOf(this.packing());
    return view === null ? null : packingBoard(view, dataOf(this.handover()));
  });

  protected readonly handoverBoard = computed(() => {
    const queue = dataOf(this.handover());
    return queue === null ? null : handoverBoard(queue, dataOf(this.day()));
  });

  /**
   * **Manque signalé — décision attendue** (lot E6a), par numéro : la carte
   * du colisage passe au fond d'alerte et porte la décision (Hugo,
   * 2026-10-25), le masthead dit combien attendent.
   */
  protected readonly shortfalls = computed(
    () =>
      new Map(
        (dataOf(this.day())?.awaitingDecision ?? []).map((order) => [order.reference, order]),
      ),
  );

  /** « 1 commande demande votre décision », sinon `null` : rien à dire. */
  protected readonly decisionMessage = computed(() => {
    const count = this.shortfalls().size;
    if (count === 0) {
      return null;
    }
    return count === 1
      ? '1 commande demande votre décision'
      : `${String(count)} commandes demandent votre décision`;
  });

  /**
   * **Annulées après l'arrêt** (plan A1, lot A1.3) : gardées au compte à
   * produire, leur feuille retirée du colisage — le compteur que le serveur
   * tient par acheminement, additionné.
   */
  protected readonly cancelledAfterPlan = computed(() =>
    (dataOf(this.day())?.flow ?? []).reduce((sum, line) => sum + line.cancelledAfterPlan, 0),
  );

  protected readonly latenessUnknown = computed(() => {
    const day = this.day();
    return day.status !== 'ready' || day.stale;
  });

  /** L'écart au jour du serveur : −1 hier, 0 aujourd'hui, +1 demain. */
  protected readonly relative = computed(() => {
    const date = this.date();
    const server = this.serverDay();
    return date === null || server === null ? 0 : dayDiff(date, server);
  });
  protected readonly dayOptions = DAY_OPTIONS;
  /** Aucun segment allumé pour une date hors ±1 : c'est le calendrier qui la dit. */
  protected readonly dayValue = computed(() =>
    Math.abs(this.relative()) > 1 ? '' : String(this.relative()),
  );
  protected readonly strip = computed(() => {
    const date = this.date();
    return date === null ? null : dayStripOf(date, this.relative());
  });

  protected readonly stamp = computed(() => {
    const day = this.day();
    return stampOf(
      dataOf(day),
      this.relative(),
      day.status === 'ready' && day.stale,
      Date.now(),
      DAY_REFRESH_MS,
    );
  });

  protected readonly counters = computed(() =>
    countersOf(this.preparationBoard(), this.packingBoard(), this.handoverBoard()),
  );
  protected readonly subtitles = computed(() =>
    columnSubtitlesOf(this.preparationBoard(), this.packingBoard(), this.handoverBoard()),
  );
  private readonly blockers = computed(() => blockersOf(this.packingBoard(), this.handoverBoard()));
  protected readonly columnBlockers = computed(() => columnBlockersOf(this.blockers()));

  /** Recherche, pastille, commande dépliée : une seule à la fois (A5). */
  protected readonly highlight = new SupervisionHighlight({
    packing: computed(() => dataOf(this.packing())),
    handover: computed(() => dataOf(this.handover())),
    preparationBoard: this.preparationBoard,
    packingBoard: this.packingBoard,
    handoverBoard: this.handoverBoard,
  });

  /** Les onglets du mobile : pastille rouge des blocages, ou ce que la mise en avant y trouve. */
  protected readonly tabs = computed<readonly FoldViewNavItem[]>(() =>
    supervisionTabs(
      this.counters(),
      this.blockers(),
      this.highlight.active() ? this.highlight.counts() : null,
    ),
  );

  /** Les filtres des bandes (A4) : la page les tient, les colonnes les lisent. */
  protected readonly shelfFilter = signal(ALL_SHELVES);
  protected readonly packShop = signal(ALL_POINTS);
  protected readonly handoverMethod = signal<FulfillmentMethod>('pickup');
  protected readonly handoverShop = signal(ALL_POINTS);

  constructor() {
    void this.reads.load();
    watchSupervisionDay(this.date, (columns) => this.reads.refresh(columns));
    this.followHits();
  }

  protected selectTab(key: string): void {
    if (key === 'preparation' || key === 'packing' || key === 'handover') {
      this.tab.set(key);
    }
  }

  protected pickView(value: string): void {
    if (value === 'day' || value === 'stock') {
      this.view.set(value);
    }
  }

  /** ‹ › : au téléphone, l'occurrence suivante peut vivre dans un autre onglet. */
  protected step(delta: number): void {
    this.highlight.step(delta);
    const current = this.highlight.current();
    if (this.narrow() && current !== null) {
      this.tab.set(current.hit.column);
    }
  }

  /**
   * Le message du masthead mène à la PREMIÈRE commande en décision attendue
   * de la colonne Colisage — qui les range en tête : on la met en avant par
   * son numéro, comme une recherche, et la page y défile.
   */
  protected showFirstDecision(): void {
    const first = this.shortfalls().keys().next();
    if (first.done === true) {
      return;
    }
    this.view.set('day');
    if (this.narrow()) {
      this.tab.set('packing');
    }
    this.highlight.search(first.value);
  }

  /** Une décision prise sur une carte : la carte et le compteur se relisent. */
  protected async onShortfallDecided(): Promise<void> {
    await this.reads.refresh();
  }

  /** Un segment Hier / Aujourd'hui / Demain. */
  protected pickDay(value: string): void {
    const server = this.serverDay();
    const shift = Number(value);
    if (shift === 0 || server === null) {
      this.goTo(null);
      return;
    }
    this.goTo(shiftServiceDay(server, shift));
  }

  /** `null` = revenir au jour du serveur, et le suivre de nouveau. */
  protected goTo(date: string | null): void {
    this.chosen.set(date === this.serverDay() ? null : date);
    this.highlight.clear();
    void this.router.navigate([], { queryParams: { date: this.chosen() }, replaceUrl: true });
    void this.reads.load();
  }

  /** Juger une ligne ou une commande ; un verdict enregistré fait relire la page. */
  protected async check(request: QualityRequest): Promise<void> {
    const date = this.date();
    // Décision de Hugo (2026-09-28) : feuille du bas au téléphone, panneau latéral au bureau.
    const side = this.narrow() ? 'bottom' : 'right';
    const context = qualityContextOf(
      request,
      this.quality.lookup(),
      dataOf(this.packing()),
      dataOf(this.handover()),
    );
    if (date !== null && (await this.quality.open(date, context, side))) {
      await this.reads.refresh();
    }
  }

  /** Le pain rendu part en boutique ; un envoi fait relire la page. */
  protected async sendToShop(sheet: WithdrawnPackingSheet): Promise<void> {
    const date = this.date();
    if (
      date !== null &&
      (await this.reserveShop.open(date, sheet, this.narrow() ? 'bottom' : 'right'))
    ) {
      await this.reads.refresh();
    }
  }

  /**
   * Chaque colonne défile jusqu'à sa première occurrence, puis jusqu'à la
   * courante — seulement quand la mise en avant, le curseur ou l'onglet
   * changent, jamais à chaque relecture : on ne reprend pas la main à qui lit.
   */
  private followHits(): void {
    let last = '';
    afterRenderEffect(() => {
      const hits = this.highlight.hits();
      const current = this.highlight.current();
      const signature = `${hits.map((hit) => `${hit.column}:${hit.key}`).join('|')}#${String(current?.index ?? -1)}#${this.tab()}`;
      if (signature === last) {
        return;
      }
      last = signature;
      scrollToHits(this.host.nativeElement, hits, current?.hit ?? null);
    });
  }
}
