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
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from '../../../../shared/lang-switch/locale-names';
import { ProductFormStore } from '../product-form-store';
import type { MediaSlot } from '../../product-http-api';

/** Le cadre d'un aperçu dont on ne connaît pas la taille. */
const UNKNOWN_RATIO = '4 / 3';

/** Le poids d'un fichier, en unités qu'un humain lit. */
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

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

  /**
   * Le ratio de l'aperçu — celui de l'IMAGE, pas un cadre imposé.
   *
   * Une vignette qui recadre tout en 4/3 ment sur ce qu'on a déposé : un portrait
   * y paraît carré, et on ne s'en aperçoit qu'en boutique. Elle réserve aussi sa
   * place, donc la galerie ne saute pas au chargement.
   *
   * Taille inconnue (visuel saisi par son URL) : un cadre par défaut, parce que
   * réserver une place approximative vaut mieux que n'en réserver aucune.
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
    const { width, height, bytes } = slot;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return 'Image externe — non hébergée';
    }
    const size = typeof bytes === 'number' ? ` · ${formatBytes(bytes)}` : '';
    return `${width} × ${height}${size}`;
  }

  /** Les langues qui manquent à CETTE image, nommées ; rien quand tout y est. */
  protected untranslated(index: number): string | undefined {
    const missing = this.store.mediaAltMissing(index).filter((locale) => locale !== SOURCE_LOCALE);
    return missing.length === 0
      ? undefined
      : missing.map((locale) => LOCALE_NAMES[locale]).join(' et ');
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
