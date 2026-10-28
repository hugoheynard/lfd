import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { fill } from '../../copy/client-copy.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { fullDayLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';

/**
 * **La journée a été ramenée au premier jour commandable** — on le DIT (plan
 * `plan-premier-jour-commandable.md`, lot J4). L'effet de `OrderContextStore`
 * déplaçait la date en silence : la régression du 2026-10-13 (« je croyais
 * commander pour demain… »), sous une autre cause.
 *
 * À côté de l'encadré du jour (`ServiceDayCallout`), de la même forme, mais
 * fermable et sans « Modifier » : le jour d'ouverture est déjà possible, rien
 * n'empêche de régler. La notice s'efface aussi d'elle-même quand la journée
 * retenue quitte la date d'ouverture — elle ne dirait plus vrai.
 */
@Component({
  selector: 'app-first-day-moved-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './first-day-moved-callout.html',
})
export class FirstDayMovedCallout {
  private readonly order = inject(OrderContextStore);
  private readonly locale = inject(ClientLocale);
  protected readonly c = screenCopy('commandTerms', commandTermsCopy);

  /** La phrase, ou `null` : rien n'a été déplacé, ou la notice est fermée. */
  protected readonly message = computed<string | null>(() => {
    const moved = this.order.movedToFirstDay();
    if (moved === null) {
      return null;
    }
    const held = this.order.choice()?.date ?? this.order.draft()?.date;
    if (held !== moved) {
      return null;
    }
    return fill(this.c().firstDayMoved, { day: fullDayLabel(moved, this.locale.current()) });
  });

  protected dismiss(): void {
    this.order.movedToFirstDay.set(null);
  }
}
