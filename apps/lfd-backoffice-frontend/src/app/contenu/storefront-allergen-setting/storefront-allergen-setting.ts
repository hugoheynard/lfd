import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { StorefrontAllergenDisplay } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { StorefrontService } from '../storefront.service';

/** Les deux places, dans les mots de l'écran. */
export const ALLERGEN_DISPLAY_OPTIONS: readonly {
  readonly value: StorefrontAllergenDisplay;
  readonly label: string;
}[] = [
  { value: 'sheet', label: 'Sur la fiche ouverte seulement' },
  { value: 'gallery', label: 'Aussi dans la galerie' },
];

/**
 * **La place des allergènes en boutique** — réglage global de la vitrine
 * (Hugo, 2026-10-27, `documentation/pim/plan-allergenes-en-boutique.md`).
 *
 * Enregistré au choix, à part de la composition : régler ne recompose rien,
 * et ne doit pas attendre « Enregistrer » ni refuser un éditeur ouvert. Le
 * serveur trace le changement au journal de la vitrine.
 */
@Component({
  selector: 'app-storefront-allergen-setting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent],
  templateUrl: './storefront-allergen-setting.html',
})
export class StorefrontAllergenSetting {
  /** Sans l'écriture, le réglage se lit et ne se change pas. */
  readonly canWrite = input(false);

  private readonly api = inject(StorefrontService);
  private readonly notify = inject(NotifyService);

  protected readonly options = ALLERGEN_DISPLAY_OPTIONS;
  /** `null` : pas encore lu (ou illisible) — la liste reste fermée. */
  protected readonly value = signal<StorefrontAllergenDisplay | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.value.set((await this.api.settings()).allergenDisplay);
    } catch (error) {
      this.notify.error(error, 'La place des allergènes n’a pas pu être lue.');
    }
  }

  /** Le choix de la liste : écrit tout de suite, revient en arrière sur un refus. */
  async choose(next: StorefrontAllergenDisplay): Promise<void> {
    const before = this.value();
    if (next === before) {
      return;
    }
    this.value.set(next);
    this.saving.set(true);
    try {
      await this.api.saveAllergenDisplay(next);
      this.notify.success(
        'Place des allergènes enregistrée : la boutique l’applique dès maintenant.',
      );
    } catch (error) {
      this.value.set(before);
      this.notify.error(error, 'La place des allergènes n’a pas pu être enregistrée.');
    } finally {
      this.saving.set(false);
    }
  }
}
