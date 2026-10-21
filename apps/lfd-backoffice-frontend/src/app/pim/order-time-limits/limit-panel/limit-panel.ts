import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { OrderTimeLimitPayload, OrderTimeLimitView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldListboxComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { daysPhrase } from '../limit-format';

/** Charge d'ouverture : le produit visé, et sa limite s'il en a une. */
export interface LimitPanelData {
  readonly productId: string;
  /** Le nom du produit, pour l'en-tête. */
  readonly label: string;
  readonly rule: OrderTimeLimitView | null;
}

/** Les délais proposés. Pas d'entrée « hériter » : il n'y a plus de rang au-dessus. */
const DAYS_CHOICES: FoldSelectOption<string>[] = [0, 1, 2, 3, 7].map((days) => ({
  value: String(days),
  label: days === 7 ? 'Une semaine avant' : daysPhrase(days),
}));

/**
 * Panneau **Limite de commande** — pose ou modifie la limite d'UN produit.
 *
 * Depuis le 2026-10-21 (décision de Hugo, `limites-de-commande/
 * schema-des-reglages.md` §4) : une limite par produit, **règle entière** — le
 * délai ET l'heure — et **sans rattrapage** : le seul rattrapage est celui de
 * la règle générale (Réglages › Commandes › Heure limite). Plus de choix de
 * portée, plus de champ « hériter ». Une déclinaison suit son produit.
 */
@Component({
  selector: 'app-limit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldListboxComponent,
  ],
  templateUrl: './limit-panel.html',
})
export class LimitPanel {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<LimitPanelData | undefined>(undefined);

  protected readonly daysChoices = DAYS_CHOICES;
  protected readonly daysBefore = signal<string>('1');
  protected readonly time = signal<string>('');
  protected readonly saving = signal(false);

  protected readonly label = computed(() => this.data()?.label ?? '');
  protected readonly isCreate = computed(() => (this.data()?.rule ?? null) === null);
  protected readonly heading = computed(() =>
    this.isCreate() ? 'Nouvelle limite de commande' : 'Modifier la limite',
  );

  /** Le délai ET l'heure : une limite qui n'en dit qu'un ne refuserait rien. */
  protected readonly canSubmit = computed(() => this.time().trim() !== '' && !this.saving());

  protected readonly recap = computed(() =>
    this.time().trim() === ''
      ? "Renseignez l'heure : une limite dit le délai et l'heure."
      : `Commander au plus tard ${daysPhrase(Number(this.daysBefore())).toLowerCase()}, avant ${this.time()}. Passé cette heure, la commande est refusée.`,
  );

  constructor() {
    effect(() => {
      const rule = this.data()?.rule ?? null;
      if (rule === null) {
        return;
      }
      this.daysBefore.set(String(rule.daysBefore ?? 1));
      this.time.set(rule.time ?? '');
    });
  }

  protected onDays(value: string): void {
    this.daysBefore.set(value);
  }

  protected onTime(event: Event): void {
    this.time.set((event.target as HTMLInputElement).value);
  }

  protected async submit(): Promise<void> {
    const data = this.data();
    if (!this.canSubmit() || data === undefined) {
      return;
    }
    this.saving.set(true);
    const payload: OrderTimeLimitPayload = {
      scope: { type: 'product', id: data.productId },
      daysBefore: Number(this.daysBefore()),
      time: this.time(),
      graceMinutes: null,
    };
    try {
      await this.api.set(payload);
      this.notify.success('Limite enregistrée.');
      this.ref.close(true);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
