import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FulfillmentWindow } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPopoverTriggerDirective,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { plannerCopy } from '../../copy/screens/planner.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { formatWindow } from '../../format-hour';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { parisDayOf } from '../../shop/shelf-stock-today.store';
import { FAVORITES_SHELF, SHELF_PARAM } from '../../shop/shelves';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ShopClock } from '../../shop/shop-clock';
import { PlannerBoard } from '../planner-board.store';
import { PlannerCellComponent, type PlannerTarget } from '../planner-cell/planner-cell';
import {
  cellKey,
  dayRefusalOf,
  isEditable,
  nextDay,
  windowKey,
  type PlannerCell,
} from '../planner-grid';
import { recheckAtNearestClose } from '../planner-recheck';
import { PlannerSlots } from '../planner-slots';

/** Un favori de la colonne de gauche, prêt à dessiner. */
interface FavoriteRow {
  readonly sku: string;
  readonly name: string;
  /** « Pas commandable lun. 1 » au repos, ou `null` s'il passe partout. */
  readonly notOrderable: string | null;
}

/**
 * `/planificateur` — **le planificateur de commandes** d'un pro (plan
 * `documentation/commandes/planificateur/plan-planificateur-de-commandes.md`,
 * § 6.1 et § 6.2).
 *
 * Ligne 1 : la date de départ, l'espace et son acheminement. Puis la grille :
 * les favoris à gauche sur toute la hauteur, un jour par colonne, une rangée
 * par créneau ; chaque case est un panier, qui devient une commande quand le
 * jour ferme. On glisse un favori dans une case (copie), une ligne d'une case
 * à l'autre (déplacement), ou on passe par les menus « Ajouter à… » et
 * « Déplacer vers… », qui sont aussi le geste au téléphone, où les jours
 * passent en onglets.
 *
 * Page du shell client : bandeau `clientBanner`, pas de `fold-page-layout`.
 */
@Component({
  selector: 'app-planner-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PlannerBoard, PlannerSlots],
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPopoverTriggerDirective,
    FoldViewNavComponent,
    PlannerCellComponent,
    RouterLink,
  ],
  templateUrl: './planner-page.html',
  styleUrl: './planner-page.scss',
})
export class PlannerPage {
  protected readonly copy = screenCopy('planner', plannerCopy);
  protected readonly board = inject(PlannerBoard);
  protected readonly slots = inject(PlannerSlots);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly clock = inject(ShopClock);
  private readonly locale = inject(ClientLocale);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly favoritesShelf = { [SHELF_PARAM]: FAVORITES_SHELF };
  protected readonly today = computed(() => parisDayOf(this.clock.now()));
  protected readonly activeDay = signal<string>('');

  protected readonly days = this.board.days;
  protected readonly windows = this.board.windows;

  /** Le jour que « ＋ » ajoute : le lendemain du dernier affiché, jusqu'à l'horizon. */
  protected readonly nextDayToAdd = computed<string | null>(() => {
    const last = this.days().at(-1);
    const limit = this.board.lastPlannableDay();
    if (last === undefined) {
      return null;
    }
    const next = nextDay(last);
    return limit !== null && next > limit ? null : next;
  });

  /** Les créneaux du site qui n'ont pas encore leur rangée. */
  protected readonly freeSlots = computed<readonly FulfillmentWindow[]>(() => {
    const taken = new Set(this.windows().map(windowKey));
    return this.slots.candidates().filter((window) => !taken.has(windowKey(window)));
  });

  /**
   * L'acheminement de l'espace affiché. Le nom de l'espace n'y est pas : il
   * est déjà dans le chrome du shell, et l'espace se lit par la brique
   * `contextKeyed`, pas par `ClientWorkspace` (porte `context-keyed-readers`).
   */
  protected readonly siteLine = computed(() => {
    const copy = this.copy();
    const routing = this.board.routing();
    if (routing === null) {
      return '';
    }
    return routing.method === 'delivery' && routing.deliveryAddress !== null
      ? copy.deliveryTo.replace('{city}', routing.deliveryAddress.ville)
      : copy.pickup;
  });

  protected readonly dayTabs = computed<readonly FoldViewNavItem[]>(() =>
    this.days().map((day) => ({ key: day, label: this.dayLabel(day) })),
  );

  protected readonly favoriteRows = computed<readonly FavoriteRow[]>(() => {
    const checks = this.board.checks();
    const copy = this.copy();
    return this.board.favorites().map((sku) => {
      const refused = this.days().filter((day) => dayRefusalOf(checks, sku, day) !== null);
      return {
        sku,
        name: this.catalogue.itemOf(sku)?.name ?? sku,
        notOrderable:
          refused.length === 0
            ? null
            : copy.notOrderableOn.replace(
                '{days}',
                refused.map((d) => this.dayLabel(d)).join(', '),
              ),
      };
    });
  });

  /** Toutes les cases écrivables de la grille, pour les menus. */
  private readonly editableCells = computed<readonly PlannerCell[]>(() => {
    const now = this.clock.now();
    return this.days().flatMap((day) =>
      this.windows()
        .map((window) => this.board.cellAt(day, window))
        .filter((cell) => isEditable(cell, now)),
    );
  });

  constructor() {
    void this.catalogue.hydrate();
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      void this.board.flushNow();
    });
    if (!this.browser) {
      return;
    }
    void this.board.load(nextDay(this.today()));
    void this.slots.loadPickup(nextDay(this.today()));
    effect(() => {
      const days = this.days();
      if (!days.includes(this.activeDay()) && days[0] !== undefined) {
        this.activeDay.set(days[0]);
      }
    });
    recheckAtNearestClose(this.board, destroyRef);
    flushWhenLeaving(this.board, destroyRef);
  }

  protected retry(): void {
    void this.board.load(this.board.from());
  }

  protected changeFrom(day: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(day)) {
      void this.board.load(day);
      void this.slots.loadPickup(day);
    }
  }

  protected addDay(): void {
    const day = this.nextDayToAdd();
    if (day !== null) {
      this.board.addDay(day);
      this.activeDay.set(day);
    }
  }

  protected dayLabel(day: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00.000Z`));
  }

  protected windowLabel(window: FulfillmentWindow): string {
    return formatWindow(window.start, window.end, this.copy().before);
  }

  protected cellLabel(cell: PlannerCell): string {
    return this.copy()
      .cellName.replace('{day}', this.dayLabel(cell.day))
      .replace('{slot}', this.windowLabel(cell.window));
  }

  protected cellOf(day: string, window: FulfillmentWindow): PlannerCell {
    return this.board.cellAt(day, window);
  }

  protected editable(cell: PlannerCell): boolean {
    return isEditable(cell, this.clock.now());
  }

  /** Les cases où une ligne peut aller, sauf `from`, avec le refus de chacune. */
  protected targetsFrom(from: string | null): (sku: string) => readonly PlannerTarget[] {
    return (sku) => {
      const checks = this.board.checks();
      return this.editableCells()
        .filter((cell) => cell.key !== from)
        .map((cell) => ({
          key: cell.key,
          label: this.cellLabel(cell),
          refusal: dayRefusalOf(checks, sku, cell.day),
        }));
    };
  }

  /** Pendant un glisser : `''` si la case accepte, la phrase du refus sinon ; `null` au repos. */
  protected dropState(cell: PlannerCell): string | null {
    const drag = this.board.dragging();
    if (drag === null || drag.from === cell.key) {
      return null;
    }
    return dayRefusalOf(this.board.checks(), drag.sku, cell.day) ?? '';
  }

  protected startFavoriteDrag(event: DragEvent, sku: string): void {
    event.dataTransfer?.setData('text/plain', sku);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'copy';
    }
    this.board.dragging.set({ sku, from: null });
  }

  protected endDrag(): void {
    this.board.dragging.set(null);
  }

  protected dropOn(cell: PlannerCell): void {
    const drag = this.board.dragging();
    this.board.dragging.set(null);
    if (drag === null) {
      return;
    }
    if (drag.from === null) {
      this.board.add(drag.sku, cell.key);
    } else {
      this.board.move(drag.sku, drag.from, cell.key);
    }
  }

  protected addTo(sku: string, key: string): void {
    this.board.add(sku, key);
  }

  protected cellKeyOf(day: string, window: FulfillmentWindow): string {
    return cellKey(day, window);
  }
}

/**
 * Quitter l'onglet ne perd pas le dernier geste : un onglet qui se cache
 * (changement d'onglet, mise en veille du téléphone) ou se ferme écrit tout
 * de suite ce qui attend, en `keepalive`. Si un geste n'est pas encore
 * enregistré, le navigateur demande confirmation avant de fermer.
 */
function flushWhenLeaving(board: PlannerBoard, destroyRef: DestroyRef): void {
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') {
      void board.flushNow(true);
    }
  };
  const onPageHide = (): void => {
    void board.flushNow(true);
  };
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (board.hasUnsavedWrites()) {
      void board.flushNow(true);
      event.preventDefault();
    }
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  destroyRef.onDestroy(() => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
}
