import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldFileDropzoneComponent,
  FoldInputComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { LangSwitch } from '../../../../shared/lang-switch/lang-switch';
import { LOCALE_NAMES, missingSentence } from '../../../../shared/lang-switch/locale-names';
import { ProductFormStore } from '../product-form-store';
import type { MediaSlot } from '../../product-http-api';

const MEDIA_ROLES: readonly { value: string; label: string }[] = [
  { value: 'hero', label: 'Principale' },
  { value: 'gallery', label: 'Galerie' },
  { value: 'lifestyle', label: 'Ambiance' },
  { value: 'thumbnail', label: 'Miniature' },
  { value: 'print', label: 'Impression' },
];

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
  imports: [
    LangSwitch,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldFileDropzoneComponent,
    FoldInputComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './visuals-panel.html',
  styleUrl: './panel.scss',
})
export class VisualsPanel {
  protected readonly store = inject(ProductFormStore);

  /** L'invite nomme la langue — sans elle, on croit relire le même champ. */
  protected readonly altPlaceholder = computed(
    () => `Ce que montre l'image (${LOCALE_NAMES[this.store.mediaLocale()]})`,
  );

  protected readonly missingHint = computed(() =>
    missingSentence('Des textes alternatifs manquent', this.store.mediaMissing()),
  );
  protected readonly roles = MEDIA_ROLES;

  /** Ce qu'on sait du fichier, ou son absence de mesure — jamais « 0 × 0 ». */
  protected metaOf(slot: MediaSlot): string {
    const { width, height } = slot;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return 'Image externe — non hébergée';
    }
    return `${width} × ${height} px`;
  }

  /** Un seul fichier à la fois : `fold-file-dropzone` remet son champ à zéro
   *  lui-même, donc redéposer le MÊME fichier après un refus fonctionne. */
  protected pick(files: readonly File[]): void {
    const file = files[0];
    if (file !== undefined) {
      void this.store.uploadMedia(file);
    }
  }
}
