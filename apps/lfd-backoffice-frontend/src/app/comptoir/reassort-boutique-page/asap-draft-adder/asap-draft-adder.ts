import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FoldButtonComponent, FoldNumberInputComponent } from 'fold-ng';

import { SiteResuppliesStore } from '../site-resupplies.store';

/**
 * **« Ajouter à la demande au plus tôt »** — la proposition d'une alerte de
 * stock (lots R1b et R1c, 2026-10-21) : l'article en rupture ou en stock
 * faible rejoint la demande « au plus tôt » en cours du point, plutôt qu'un
 * réassort à part. La quantité est saisie ici ; la carte « Commander au
 * fournil » la montre aussitôt, et c'est là qu'on envoie.
 */
@Component({
  selector: 'app-asap-draft-adder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldNumberInputComponent],
  templateUrl: './asap-draft-adder.html',
  styleUrl: './asap-draft-adder.scss',
})
export class AsapDraftAdder {
  private readonly store = inject(SiteResuppliesStore);

  readonly sku = input.required<string>();

  protected readonly opened = signal(false);
  protected readonly quantity = signal<number | null>(null);
  protected readonly pending = this.store.pending;
  protected readonly canAdd = computed(() => (this.quantity() ?? 0) >= 1 && !this.pending());

  protected open(): void {
    this.opened.set(true);
    this.quantity.set(null);
  }

  protected close(): void {
    this.opened.set(false);
  }

  protected async add(): Promise<void> {
    const quantity = this.quantity();
    if (quantity === null || !this.canAdd()) {
      return;
    }
    if (await this.store.addLine('asap', this.sku(), quantity)) {
      this.opened.set(false);
    }
  }
}
