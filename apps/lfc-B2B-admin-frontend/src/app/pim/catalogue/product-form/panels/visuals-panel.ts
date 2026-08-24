import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldOptionComponent,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';
import type { MediaSlot } from '../../product-http-api';

const MEDIA_ROLES: readonly { value: string; label: string }[] = [
  { value: 'hero', label: 'Principale' },
  { value: 'gallery', label: 'Galerie' },
  { value: 'lifestyle', label: 'Ambiance' },
  { value: 'thumbnail', label: 'Miniature' },
  { value: 'print', label: 'Impression' },
];

/** Le ratio par défaut d'un aperçu dont on ne connaît pas la taille. */
const UNKNOWN_RATIO = '1 / 1';

/**
 * Panneau **Visuels** — dépôt de fichier vers la bibliothèque média, puis
 * composition de la liste du produit.
 *
 * Les deux gestes sont volontairement distincts : déposer crée un fichier et ne
 * touche à aucune fiche ; enregistrer remplace la liste entière du produit.
 */
@Component({
  selector: 'app-visuals-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent, FoldListboxComponent, FoldOptionComponent],
  templateUrl: './visuals-panel.html',
  styleUrl: './panel.scss',
})
export class VisualsPanel {
  protected readonly store = inject(ProductFormStore);
  protected readonly roles = MEDIA_ROLES;

  /**
   * Le ratio de l'aperçu. Une taille inconnue (visuel saisi par son URL) rend
   * un carré : réserver une place approximative vaut mieux que n'en réserver
   * aucune, qui fait sauter toute la liste au chargement.
   */
  protected ratioOf(slot: MediaSlot): string {
    const { width, height } = slot;
    if (typeof width !== 'number' || typeof height !== 'number' || height === 0) {
      return UNKNOWN_RATIO;
    }
    return `${width} / ${height}`;
  }

  /** Ce qu'on sait du fichier, ou son absence de mesure — jamais « 0 × 0 ». */
  protected metaOf(slot: MediaSlot): string {
    const { width, height } = slot;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return 'Image externe — non hébergée';
    }
    return `${width} × ${height} px`;
  }

  protected pick(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const file = input.files?.[0];
    if (file !== undefined) {
      void this.store.uploadMedia(file);
    }
    // Remet le champ à zéro : sans ça, redéposer le MÊME fichier après un refus
    // n'émettrait aucun `change`, et le bouton paraîtrait mort.
    input.value = '';
  }
}
