import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { addDays, instantToLocal } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { CartBar } from '../../cart/cart-bar/cart-bar';
import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { dayPickerCopy } from '../../copy/screens/day-picker.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { dialogSide } from '../../panel-side';
import { limitHourLabel } from '../cutoff-labels';
import { MonthPicker } from '../month-picker/month-picker';
import { OrderContextStore } from '../../order-context.store';
import { ORDER_DIALOG } from '../order-dialog';
import { ServicePoints } from '../pickup-points.store';
import { isServedDay, servedWindow, todayService } from '../served-days';
import { ShopClock } from '../shop-clock';

/** Combien de jours suivent « aujourd'hui » dans la grille (plan, §2). */
const NEXT_DAYS = 6;

/** Un des six jours suivants, tel que la grille le montre. */
interface NextDay {
  readonly day: string;
  readonly weekday: string;
  readonly date: string;
  readonly served: boolean;
}

/**
 * **« Pour quel jour ? »** — la première question d'une commande neuve, avant
 * « retrait ou coursier ? » (plan `documentation/commandes/passation/
 * parcours-de-service.md`).
 *
 * 🔴 Le front n'invente aucun jour : tout se lit dans {@link ServicePoints}
 * (`GET /fulfillment-days`). « Aujourd'hui » n'apparaît que si le serveur le
 * sert ; un jour non servi reste visible et grisé.
 *
 * « Autre date » déplie un calendrier mensuel navigable (`MonthPicker`,
 * Hugo, 2026-10-27) : `fold-calendar-month` est une grille d'événements, sans
 * jour sélectionnable (lu dans `fold-ng.d.ts` le 2026-10-27).
 */
@Component({
  selector: 'app-day-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
    MonthPicker,
    CartBar,
  ],
  templateUrl: './day-picker-dialog.html',
  styleUrl: './day-picker-dialog.scss',
})
export class DayPickerDialog {
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /** Rend le jour choisi (`AAAA-MM-JJ`), ou `undefined` — fermer n'est pas choisir. */
  static open(panels: FoldPanelHostService): FoldPanelRef<string | undefined> {
    return panels.open<undefined, string | undefined>(DayPickerDialog, {
      side: dialogSide(),
      stack: true,
      data: undefined,
    });
  }

  /** Rien à recevoir ; le contrat du panneau l'attend. */
  readonly data = input<undefined>();

  private readonly points = inject(ServicePoints);
  protected readonly locale = inject(ClientLocale);
  private readonly clock = inject(ShopClock);
  private readonly ref = inject(FoldPanelRef);

  protected readonly c = screenCopy('dayPicker', dayPickerCopy);

  private readonly order = inject(OrderContextStore);

  /** Ce qui est déjà acquis — le mode, la maison —, jamais un numéro d'étape. */
  protected readonly kicker = computed(() => {
    const copy = this.c();
    const draft = this.order.draft();
    if (draft?.mode === 'delivery') {
      return copy.kickerDelivery;
    }
    if (draft?.mode === 'pickup') {
      return draft.place === undefined
        ? copy.kickerPickup
        : fill(copy.kickerPickupAt, { place: draft.place });
    }
    return copy.kicker;
  });

  protected readonly loading = signal(true);

  /** Le champ « Autre date » est-il déplié ? */
  protected readonly otherOpen = signal(false);

  private readonly today = computed(() => instantToLocal(this.clock.now()).day);

  private readonly window = computed(() => servedWindow(this.points.days(), this.points.lastDay()));

  /** Vrai quand aucun jour n'est servi : l'écran le dit. */
  protected readonly noDay = computed(() => this.window().first === null);

  /** Le libellé d'« Aujourd'hui », ou `null` : le serveur ne sert pas aujourd'hui. */
  protected readonly todayLabel = computed<string | null>(() => {
    const served = todayService(this.points.days(), this.today());
    if (served === null || !isServedDay(this.today(), this.window())) {
      return null;
    }
    const copy = this.c();
    return served.orderUntil === null
      ? copy.today
      : fill(copy.todayUntil, {
          time: limitHourLabel(new Date(served.orderUntil), this.locale.current()),
        });
  });

  protected readonly nextDays = computed<readonly NextDay[]>(() => {
    const locale = this.locale.current();
    const window = this.window();
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const date = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return Array.from({ length: NEXT_DAYS }, (_unused, index) => {
      const day = addDays(this.today(), index + 1);
      // À midi UTC : aucun fuseau ne fait changer de jour.
      const noon = new Date(`${day}T12:00:00.000Z`);
      return {
        day,
        weekday: weekday.format(noon),
        date: date.format(noon),
        served: isServedDay(day, window),
      };
    });
  });

  /** Les bornes du champ : le premier et le dernier jour servis. */
  protected readonly min = computed(() => this.window().first ?? '');
  protected readonly max = computed(() => this.window().last);

  /** Ce que le calendrier rend cliquable : la fenêtre servie, et rien d'autre. */
  protected readonly servedDay = (day: string): boolean => isServedDay(day, this.window());

  constructor() {
    // Idempotent : la boutique les a souvent déjà lus.
    void this.points.hydrate().finally(() => {
      this.loading.set(false);
    });
  }

  protected pick(day: string): void {
    if (isServedDay(day, this.window())) {
      this.ref.close(day);
    }
  }

  protected pickToday(): void {
    this.pick(this.today());
  }

  protected toggleOther(): void {
    this.otherOpen.update((open) => !open);
  }
}
