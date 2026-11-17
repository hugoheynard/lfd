import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { ProductionDisplayView, ProductionGrouping } from '@lfd/contracts';
import { RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { ProductionSettingsService } from '../../production-settings.service';

const MODE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'shelf', label: 'Mode boutique' },
  { value: 'workstation', label: 'Mode prod' },
];

/**
 * **Le rangement du fournil** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.9).
 *
 * Passer en mode prod demande une confirmation qui donne le compte des
 * produits commandés sans poste ; le serveur, lui, ne refuse que la bascule à
 * vide, et son refus s'affiche tel quel. Simuler le dossier a sa page, où
 * mène un lien (décidé par Hugo le 2026-11-17).
 */
@Component({
  selector: 'app-production-grouping-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  templateUrl: './production-grouping-card.html',
  styleUrl: './production-grouping-card.scss',
})
export class ProductionGroupingCard {
  private readonly settings = inject(ProductionSettingsService);

  /** Le réglage servi ; `null` : il n'a pas pu être lu, ou n'est pas permis. */
  readonly display = input.required<ProductionDisplayView | null>();
  /** Les produits commandés ces jours-ci sans poste : le compte de la confirmation. */
  readonly unplacedOrdered = input.required<number>();
  readonly canWrite = input.required<boolean>();
  /** Le réglage est-il permis en lecture ? Sinon la carte ne garde que le lien vers la simulation. */
  readonly canRead = input.required<boolean>();
  /** Après une bascule acceptée : le parent relit. */
  readonly saved = output();

  protected readonly mode = computed<ProductionGrouping>(() => this.display()?.grouping ?? 'shelf');
  /** La bascule vers le mode prod, en attente de confirmation. */
  protected readonly confirming = signal(false);
  protected readonly shown = computed(() => (this.confirming() ? 'workstation' : this.mode()));
  protected readonly busy = signal(false);
  /** Les deux modes ; désarmés sans le droit, ou pendant l'envoi. */
  protected readonly modeOptions = computed<readonly FoldViewToggleOption[]>(() =>
    MODE_OPTIONS.map((option) => ({ ...option, disabled: !this.canWrite() || this.busy() })),
  );
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    // Un refus dit l'état de la carte au moment du geste : dès que les postes
    // changent (un rayon placé, un poste créé), il ne dit plus rien de vrai.
    effect(() => {
      this.unplacedOrdered();
      untracked(() => this.refusal.set(null));
    });
  }

  protected choose(value: string): void {
    const wanted: ProductionGrouping = value === 'workstation' ? 'workstation' : 'shelf';
    this.refusal.set(null);
    if (wanted === this.mode()) {
      this.confirming.set(false);
      return;
    }
    if (wanted === 'workstation' && this.unplacedOrdered() > 0) {
      this.confirming.set(true);
      return;
    }
    void this.save(wanted);
  }

  protected confirm(): void {
    void this.save('workstation');
  }

  protected cancel(): void {
    this.confirming.set(false);
  }

  private async save(grouping: ProductionGrouping): Promise<void> {
    const display = this.display();
    if (display === null || !this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.settings.saveDisplay({ showSubcategories: display.showSubcategories, grouping });
      this.confirming.set(false);
      this.saved.emit();
    } catch (error) {
      this.confirming.set(false);
      this.refusal.set(httpErrorMessage(error, 'Le rangement n’a pas pu être enregistré.'));
    } finally {
      this.busy.set(false);
    }
  }
}
