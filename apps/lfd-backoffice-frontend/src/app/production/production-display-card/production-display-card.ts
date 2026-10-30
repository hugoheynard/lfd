import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { ProductionDisplayView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { ProductionSettingsService } from '../production-settings.service';

/**
 * **Le rangement du fournil** (Hugo, 2026-10-30) — prévisionnel, fiche
 * d'atelier et dossier du jour rangent par catégorie RACINE ; cette case
 * ajoute, dans chaque groupe racine, un intertitre par sous-catégorie.
 *
 * S'enregistre d'un geste, comme le contrôle qualité : la case cochée part
 * aussitôt, et un refus la remet à l'état servi.
 */
@Component({
  selector: 'app-production-display-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './production-display-card.html',
})
export class ProductionDisplayCard {
  private readonly api = inject(ProductionSettingsService);

  readonly display = input.required<ProductionDisplayView>();
  readonly canWrite = input.required<boolean>();
  /** Après un enregistrement accepté : le parent relit. */
  readonly saved = output();

  /** Par l'identité de la vue : un refus remet une vue neuve, et la case revient à l'état servi. */
  protected readonly shown = linkedSignal<readonly ProductionDisplayView[]>(() => [this.display()]);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected async set(showSubcategories: boolean): Promise<void> {
    if (!this.canWrite() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.saveDisplay({ showSubcategories });
      this.saved.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le rangement n’a pas pu être enregistré.'));
      this.shown.set([{ ...this.display() }]);
    } finally {
      this.busy.set(false);
    }
  }
}
