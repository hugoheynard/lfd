import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent, FoldDateComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { NO_DAYS, type OrderDays } from '../client-order-history.service';

/**
 * Le filtre « du … au … » de « Mes commandes » — le jour de retrait ou de
 * livraison (plan `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`,
 * §6.6, lot R3).
 *
 * Il ne filtre rien lui-même : il émet des bornes, que l'écran fait RELIRE au
 * serveur (`?from=&to=`). Les deux champs se bornent l'un l'autre (`min`/`max`)
 * et une paire inversée n'est pas émise : le serveur la refuserait, et la liste
 * resterait sur l'ancienne réponse sans rien dire. Une borne posée, la phrase
 * dit ce qu'elle écarte : les commandes sans date.
 */
/**
 * La première année qu'un jour de commande peut porter. Le champ de date émet
 * à CHAQUE chiffre de l'année : taper « 2020 » passe par `0002`, `0020`,
 * `0202`. Relues au serveur, ces années en cours de frappe rendaient un 400
 * dans la console (relevé en production le 2026-10-28).
 */
const FIRST_ORDER_YEAR = 2000;

/** Un jour qu'on a fini de taper — vide compris, qui efface la borne. */
function settled(value: string): boolean {
  return value === '' || Number(value.slice(0, 4)) >= FIRST_ORDER_YEAR;
}

@Component({
  selector: 'app-order-day-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldDateComponent],
  templateUrl: './order-day-filter.html',
  styleUrl: './order-day-filter.scss',
})
export class OrderDayFilter {
  /** Les bornes en vigueur — celles que la liste a relues. */
  readonly days = input.required<OrderDays>();

  readonly daysChange = output<OrderDays>();

  private readonly t = inject(ClientCopyService).t;
  protected readonly copy = computed(() => this.t().orders.summary);

  protected readonly bounded = computed(() => this.days().from !== null || this.days().to !== null);

  protected chooseFrom(value: string): void {
    if (!settled(value)) {
      return;
    }
    this.emit({ from: value === '' ? null : value, to: this.days().to });
  }

  protected chooseTo(value: string): void {
    if (!settled(value)) {
      return;
    }
    this.emit({ from: this.days().from, to: value === '' ? null : value });
  }

  protected clear(): void {
    this.daysChange.emit(NO_DAYS);
  }

  private emit(days: OrderDays): void {
    if (days.from !== null && days.to !== null && days.from > days.to) {
      return;
    }
    this.daysChange.emit(days);
  }
}
