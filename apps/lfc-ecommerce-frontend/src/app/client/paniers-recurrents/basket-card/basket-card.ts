import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { RecurringOccurrenceView, SubscriptionView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientSubscriptions } from '../../client-subscriptions.service';
import { fill } from '../../copy/client-copy.service';
import { recurringBasketsCopy } from '../../copy/screens/recurring-baskets.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { fullDayLabel } from '../../format-day';
import { SALES_TERMS_SIDE_PARAM } from '../../sales-terms-side';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import {
  isEditable,
  isNotPlaced,
  isRestorable,
  periodLabel,
  splitOccurrences,
  windowLabel,
} from '../basket-format';
import { OccurrenceDialog } from '../occurrence-dialog/occurrence-dialog';

/** Le geste en cours : un seul à la fois par carte. */
type Pending = 'status' | 'stop' | `occurrence:${string}` | null;

/**
 * **Un panier récurrent** : son rythme, sa période, son acheminement et son
 * créneau, ses lignes, son état — et ses gestes (pause, reprise, arrêt
 * confirmé). Dessous, « Mes prochaines commandes » : chaque échéance, par
 * jour, avec ce qu'on peut encore y faire.
 *
 * Un refus du serveur s'affiche dans la carte (`fold-callout` annoncé) ; un
 * succès s'annonce de même, et la liste relue dit le nouvel état.
 */
@Component({
  selector: 'app-basket-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
    NgTemplateOutlet,
    RouterLink,
  ],
  templateUrl: './basket-card.html',
  styleUrl: './basket-card.scss',
})
export class BasketCard {
  readonly basket = input.required<SubscriptionView>();
  /** `AAAA-MM-JJ`, jour de Paris : ce qui le précède est passé. */
  readonly today = input.required<string>();

  protected readonly copy = screenCopy('recurringBaskets', recurringBasketsCopy);
  private readonly locale = inject(ClientLocale).current;
  private readonly subscriptions = inject(ClientSubscriptions);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly pending = signal<Pending>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly stopOpen = signal(false);

  protected readonly paused = computed(() => this.basket().status === 'paused');

  protected readonly period = computed(() =>
    periodLabel(this.basket(), this.copy(), (iso) => this.day(iso)),
  );

  protected readonly routing = computed(() => {
    const basket = this.basket();
    const copy = this.copy();
    const address = basket.deliveryAddress;
    if (basket.fulfillmentMethod === 'pickup' || address === null) {
      return copy.pickup;
    }
    return `${copy.delivery} · ${address.ligne1}, ${address.codePostal} ${address.ville}`;
  });

  protected readonly slot = computed(() => windowLabel(this.basket().requestedWindow, this.copy()));

  protected readonly lines = computed(() =>
    this.basket().lines.map((line) => `${line.quantity} × ${this.nameOf(line.sku)}`),
  );

  protected readonly newTerms = computed(() => {
    const next = this.basket().nextSalesTerms;
    return next === null ? null : fill(this.copy().newTerms, { date: this.day(next.effectiveOn) });
  });

  /** Le texte de CGV que le panier applique : pro ou particulier. */
  protected readonly termsQuery = computed(() => ({
    [SALES_TERMS_SIDE_PARAM]:
      this.basket().salesTerms.document === 'salesTermsPro' ? 'pro' : 'particulier',
  }));

  protected readonly termsName = computed(() =>
    fill(this.copy().newTab, { name: this.copy().termsLink }),
  );

  protected readonly occurrences = computed(() =>
    splitOccurrences(this.basket().occurrences, this.today()),
  );

  protected readonly confirmLabels = computed(() => ({
    confirm: this.copy().stopConfirm,
    cancel: this.copy().cancel,
    cancelAria: this.copy().cancel,
    busy: this.copy().busy,
    group: this.copy().confirmGroup,
  }));

  protected readonly isEditable = isEditable;
  protected readonly isRestorable = isRestorable;
  protected readonly isNotPlaced = isNotPlaced;

  protected day(iso: string): string {
    return fullDayLabel(iso, this.locale());
  }

  protected nameOf(sku: string): string {
    return this.catalogue.itemOf(sku)?.name ?? sku;
  }

  protected stateLabel(occurrence: RecurringOccurrenceView): string {
    const copy = this.copy();
    if (occurrence.state === 'cancelled') {
      return '';
    }
    return occurrence.state === 'planned' && occurrence.overridden
      ? copy.overridden
      : copy.states[occurrence.state];
  }

  protected stateTone(
    occurrence: RecurringOccurrenceView,
  ): 'neutral' | 'info' | 'success' | 'warning' {
    if (occurrence.state === 'placed') {
      return 'success';
    }
    if (isNotPlaced(occurrence)) {
      return 'warning';
    }
    return occurrence.state === 'planned' && occurrence.overridden ? 'info' : 'neutral';
  }

  protected linesOf(occurrence: RecurringOccurrenceView): string {
    return occurrence.lines.map((line) => `${line.quantity} × ${this.nameOf(line.sku)}`).join(', ');
  }

  protected nameFor(sentence: string, occurrence: RecurringOccurrenceView): string {
    return fill(sentence, { day: this.day(occurrence.serviceDay) });
  }

  protected toggleStatus(): Promise<void> {
    const pausing = !this.paused();
    return this.run(
      'status',
      () => this.subscriptions.setStatus(this.basket().id, pausing ? 'paused' : 'active'),
      pausing ? this.copy().announcePaused : this.copy().announceResumed,
    );
  }

  protected async stop(): Promise<void> {
    await this.run(
      'stop',
      () => this.subscriptions.stop(this.basket().id),
      this.copy().announceStopped,
    );
    this.stopOpen.set(false);
  }

  protected skip(occurrence: RecurringOccurrenceView): Promise<void> {
    return this.run(
      `occurrence:${occurrence.serviceDay}`,
      () => this.subscriptions.skip(this.basket().id, occurrence.serviceDay),
      this.copy().announceSkipped,
    );
  }

  protected restore(occurrence: RecurringOccurrenceView): Promise<void> {
    return this.run(
      `occurrence:${occurrence.serviceDay}`,
      () => this.subscriptions.restore(this.basket().id, occurrence.serviceDay),
      this.copy().announceRestored,
    );
  }

  protected async modify(occurrence: RecurringOccurrenceView): Promise<void> {
    this.refusal.set(null);
    this.done.set(null);
    const modified = await OccurrenceDialog.open(this.panels, {
      basketId: this.basket().id,
      occurrence,
      dayLabel: this.day(occurrence.serviceDay),
      nameOf: (sku) => this.nameOf(sku),
    });
    if (modified) {
      this.done.set(this.copy().announceModified);
    }
  }

  private async run(
    gesture: Exclude<Pending, null>,
    send: () => Promise<string | null>,
    success: string,
  ): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(gesture);
    this.refusal.set(null);
    this.done.set(null);
    const refusal = await send();
    this.pending.set(null);
    if (refusal === null) {
      this.done.set(success);
    } else {
      this.refusal.set(fill(this.copy().gestureFailed, { message: refusal }));
    }
  }
}
