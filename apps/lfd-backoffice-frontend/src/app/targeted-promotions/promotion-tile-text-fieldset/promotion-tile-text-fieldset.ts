import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldFieldsetComponent, FoldInputComponent } from 'fold-ng';

import { TILE_TEXT_MAX_LENGTH, type DraftTileText } from '../promotion-tile-text';

/**
 * **« Texte sur les vignettes »** — ce que la boutique écrit sous le prix
 * d'un article quand cette remise au panier peut s'y appliquer
 * (`documentation/promotions/plan-texte-de-la-vignette.md`), avec l'aperçu
 * de ce que le client lira. Elle ne juge rien : le serveur reste juge, et son
 * refus nommé revient à la page. Désactivée, elle ne publie aucun changement.
 */
@Component({
  selector: 'app-promotion-tile-text-fieldset',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldFieldsetComponent, FoldInputComponent],
  templateUrl: './promotion-tile-text-fieldset.html',
  styleUrl: './promotion-tile-text-fieldset.scss',
})
export class PromotionTileTextFieldset {
  readonly text = input.required<DraftTileText>();
  /** Ce que la vignette dira ; `null` tant que ni texte ni valeur ne se lisent. */
  readonly preview = input.required<string | null>();
  readonly disabled = input(false);
  readonly textChange = output<DraftTileText>();

  protected readonly frenchHint = `Facultatif, ${String(TILE_TEXT_MAX_LENGTH)} caractères au plus. Vide : la valeur seule.`;

  protected patch(change: Partial<DraftTileText>): void {
    if (!this.disabled()) {
      this.textChange.emit({ ...this.text(), ...change });
    }
  }
}
