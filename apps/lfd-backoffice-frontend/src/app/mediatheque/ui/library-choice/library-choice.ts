import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { imageLabel } from '../../rules/replace-rules';
import { LibrarySearch } from '../../state/library-search';

/**
 * **Choisir dans le fonds** la remplaçante d'une image — une recherche par
 * étiquette, une grille, « Charger la suite ».
 *
 * La recherche part à la première ouverture (`open` ne relance pas) ; elle
 * est fournie par le panneau qui l'affiche, et survit donc à un aller-retour.
 * L'image actuelle reste visible mais hors d'atteinte — la masquer la ferait
 * chercher.
 */
@Component({
  selector: 'app-library-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
  ],
  templateUrl: './library-choice.html',
  styleUrl: './library-choice.scss',
})
export class LibraryChoice {
  protected readonly library = inject(LibrarySearch);

  /** L'image qu'on remplace. */
  readonly currentUrl = input.required<string>();
  readonly picked = output<LibraryMediaView>();

  protected readonly labelOf = imageLabel;

  constructor() {
    void this.library.open();
  }

  protected isCurrent(url: string): boolean {
    return this.currentUrl() === url;
  }

  protected pick(image: LibraryMediaView): void {
    this.picked.emit(image);
  }
}
