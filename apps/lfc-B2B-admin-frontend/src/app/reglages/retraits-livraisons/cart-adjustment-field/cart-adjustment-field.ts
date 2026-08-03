import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { CartAdjustment } from '@lfd/contracts';
import { FoldNumberInputComponent } from 'fold-ng';

type Mode = 'none' | 'percent' | 'amount';

/**
 * Éditeur d'un {@link CartAdjustment} — un segmenté (Aucune / % / €) + un montant.
 * L'humain saisit `20` (→ 20 % ou 20 €) ; on émet des entiers : % en points de
 * base (×100), € en centimes (×100). `allowNone=false` retire l'option « Aucune »
 * (une zone de livraison a toujours un frais). Émet `null` en mode « Aucune ».
 */
@Component({
  selector: 'app-cart-adjustment-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldNumberInputComponent],
  templateUrl: './cart-adjustment-field.html',
  styleUrl: './cart-adjustment-field.scss',
})
export class CartAdjustmentField {
  readonly value = input<CartAdjustment | null>(null);
  readonly allowNone = input(true);
  readonly label = input('Réduction');

  readonly valueChange = output<CartAdjustment | null>();

  protected readonly mode = signal<Mode>('none');
  /** Montant tel que saisi (20 = 20 % ou 20 €), ou `null` si vide. */
  protected readonly amount = signal<number | null>(null);

  protected readonly modes = computed<readonly { key: Mode; label: string }[]>(() => [
    ...(this.allowNone() ? [{ key: 'none' as const, label: 'Aucune' }] : []),
    { key: 'percent', label: '%' },
    { key: 'amount', label: '€' },
  ]);

  constructor() {
    // Seed une fois depuis l'entrée (data fixé à l'ouverture du panneau).
    effect(() => {
      const initial = this.value();
      if (initial === null) {
        this.mode.set(this.allowNone() ? 'none' : 'percent');
        this.amount.set(null);
        return;
      }
      this.mode.set(initial.mode);
      this.amount.set(
        initial.mode === 'percent' ? initial.bp / 100 : initial.cents / 100,
      );
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.emit();
  }

  protected setAmount(amount: number | null): void {
    this.amount.set(amount);
    this.emit();
  }

  private emit(): void {
    this.valueChange.emit(this.build());
  }

  /** L'état courant → un `CartAdjustment` (entiers), ou `null` (aucune / vide). */
  private build(): CartAdjustment | null {
    const mode = this.mode();
    const amount = this.amount();
    if (mode === 'none' || amount === null || amount < 0) {
      return null;
    }
    const units = Math.round(amount * 100);
    return mode === 'percent' ? { mode: 'percent', bp: units } : { mode: 'amount', cents: units };
  }
}
