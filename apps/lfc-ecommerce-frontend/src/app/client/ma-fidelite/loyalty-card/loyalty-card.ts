import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { MyLoyaltyEntryView, MyLoyaltyView, MyLoyaltyVoucherView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientLoyalty, type ConversionOutcome } from '../../client-loyalty.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import { SHOP_TIME_ZONE } from '../../shop-time-zone';

/** Ce que la carte montre — `closed` ne rend RIEN (plan des points, E1.3). */
type LoyaltyCardState = 'loading' | 'failed' | 'closed' | 'open';

type OpenLoyalty = Extract<MyLoyaltyView, { open: true }>;

/** Une ligne de liste déjà mise en mots : le gabarit ne formate rien. */
interface Row {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

/**
 * **Le cœur de `/ma-fidelite`** — le solde, ce que vaut un palier, la conversion en bon, les
 * bons et l'historique (plan `plan-points-de-fidelite.md`, §12, E1.3).
 *
 * La lecture appartient à {@link ClientLoyalty}, qui la lance seul : la carte
 * ne fait que la montrer. Programme fermé ou espace société : la carte ne rend
 * rien (la page dit alors pourquoi), et rien ne dit « bientôt ». La conversion envoie le solde AFFICHÉ : un 409 dit qu'il a
 * changé, la vue est relue et la carte le dit.
 */
@Component({
  selector: 'app-loyalty-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './loyalty-card.html',
  styleUrl: './loyalty-card.scss',
})
export class LoyaltyCard {
  private readonly loyalty = inject(ClientLoyalty);
  private readonly locale = inject(ClientLocale);
  private readonly copy = inject(ClientCopyService).t;

  protected readonly c = computed(() => this.copy().loyalty);

  /** Le nombre de paliers choisi ; ramené dans les bornes à chaque lecture. */
  private readonly chosen = signal(1);
  protected readonly confirmOpen = signal(false);
  protected readonly converting = signal(false);
  protected readonly outcome = signal<ConversionOutcome | null>(null);
  /** La valeur du dernier bon émis, pour l'annoncer. */
  private readonly lastValueCents = signal(0);

  protected readonly state = computed<LoyaltyCardState>(() => {
    const view = this.loyalty.view();
    // Une vue déjà lue reste à l'écran pendant qu'on la relit (après une
    // conversion) : la carte ne clignote pas.
    if (view !== null) {
      return view.open ? 'open' : 'closed';
    }
    return this.loyalty.status() === 'failed' ? 'failed' : 'loading';
  });

  protected readonly open = computed<OpenLoyalty | null>(() => {
    const view = this.loyalty.view();
    return view !== null && view.open ? view : null;
  });

  protected readonly steps = computed(() => {
    const max = this.open()?.convertibleSteps ?? 0;
    return Math.min(Math.max(this.chosen(), 1), Math.max(max, 1));
  });

  protected readonly balance = computed(() =>
    fill(this.c().points, { n: this.number(this.open()?.balancePoints ?? 0) }),
  );

  protected readonly stepWorth = computed(() => {
    const open = this.open();
    return open === null
      ? ''
      : fill(this.c().stepWorth, {
          points: this.number(open.pointsPerStep),
          value: formatCents(open.stepValueCents),
        });
  });

  protected readonly convertibleLabel = computed(() => {
    const n = this.open()?.convertibleSteps ?? 0;
    const c = this.c();
    if (n === 0) {
      return c.convertibleNone;
    }
    return n === 1 ? c.convertibleOne : fill(c.convertibleMany, { n: String(n) });
  });

  protected readonly stepOptions = computed<readonly FoldSelectOption<number>[]>(() => {
    const open = this.open();
    if (open === null) {
      return [];
    }
    return Array.from({ length: open.convertibleSteps }, (_, index) => {
      const n = index + 1;
      return {
        value: n,
        label: fill(this.c().stepOption, {
          n: String(n),
          value: formatCents(n * open.stepValueCents),
        }),
      };
    });
  });

  protected readonly confirmMessage = computed(() => {
    const open = this.open();
    if (open === null) {
      return '';
    }
    const n = this.steps();
    return fill(this.c().confirmMessage, {
      points: this.number(n * open.pointsPerStep),
      value: formatCents(n * open.stepValueCents),
    });
  });

  protected readonly confirmLabels = computed(() => ({
    confirm: this.c().confirm,
    cancel: this.c().cancel,
    busy: this.c().busy,
  }));

  protected readonly convertedLabel = computed(() =>
    fill(this.c().converted, { value: formatCents(this.lastValueCents()) }),
  );

  protected readonly empty = computed(() => {
    const open = this.open();
    return open !== null && open.vouchers.length === 0 && open.entries.length === 0;
  });

  protected readonly vouchers = computed<readonly Row[]>(() =>
    (this.open()?.vouchers ?? []).map((voucher) => ({
      id: voucher.id,
      label: fill(this.c().voucherValue, { value: formatCents(voucher.valueCents) }),
      detail: this.voucherDetail(voucher),
    })),
  );

  protected readonly entries = computed<readonly Row[]>(() =>
    (this.open()?.entries ?? []).map((entry) => ({
      id: entry.id,
      label: `${this.entryLabel(entry)} · ${this.date(entry.occurredAt)}`,
      detail: `${entry.points > 0 ? '+' : ''}${this.number(entry.points)}`,
    })),
  );

  protected chooseSteps(steps: number): void {
    this.chosen.set(steps);
  }

  protected reload(): void {
    void this.loyalty.load();
  }

  protected async convert(): Promise<void> {
    const open = this.open();
    if (open === null || this.converting()) {
      return;
    }
    const steps = this.steps();
    this.converting.set(true);
    this.outcome.set(null);
    const outcome = await this.loyalty.convert(steps, open.balancePoints);
    this.lastValueCents.set(steps * open.stepValueCents);
    this.converting.set(false);
    this.confirmOpen.set(false);
    this.chosen.set(1);
    this.outcome.set(outcome);
  }

  private voucherDetail(voucher: MyLoyaltyVoucherView): string {
    const c = this.c();
    switch (voucher.status) {
      case 'reserved':
        return voucher.usedOn === null
          ? fill(c.voucherUntil, { date: this.date(voucher.expiresAt) })
          : fill(c.voucherUsedOn, { order: voucher.usedOn.orderNumber });
      case 'expired':
        return c.voucherExpired;
      case 'cancelled':
        return c.voucherCancelled;
      case 'available':
        return fill(c.voucherUntil, { date: this.date(voucher.expiresAt) });
    }
  }

  private entryLabel(entry: MyLoyaltyEntryView): string {
    const c = this.c();
    switch (entry.kind) {
      case 'earned':
        return entry.orderNumber === null
          ? c.entryEarnedNoOrder
          : fill(c.entryEarned, { order: entry.orderNumber });
      case 'converted':
        return c.entryConverted;
      case 'adjusted':
        return c.entryAdjusted;
    }
  }

  /** « 27 septembre 2027 », dans la langue choisie. */
  private date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale.current(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: SHOP_TIME_ZONE,
    }).format(new Date(iso));
  }

  private number(value: number): string {
    return new Intl.NumberFormat(this.locale.current()).format(value);
  }
}
