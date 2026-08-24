import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldFileDropzoneComponent,
  FoldInputComponent,
  FoldPanelHostService,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { LangSwitch } from '../../../../shared/lang-switch/lang-switch';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from '../../../../shared/lang-switch/locale-names';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from './alt-text-panel/alt-text-panel';
import { ProductFormStore } from '../product-form-store';
import type { MediaSlot } from '../../product-http-api';

/** Le plus grand diviseur commun — pour réduire un ratio à sa forme lisible. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Le poids d'un fichier, en unités qu'un humain lit. */
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Panneau **Visuels** — dépôt de fichier vers la bibliothèque média, puis
 * composition de la liste du produit.
 *
 * Les deux gestes sont volontairement distincts : déposer crée un fichier et ne
 * touche à aucune fiche ; enregistrer remplace la liste entière du produit.
 *
 * **Cette section AGRÈGE des ressources, elle ne les classe pas.** Il n'y a donc
 * ni « principale » ni rôle à choisir ici : quelle image une boutique prend pour
 * vignette est une décision du CANAL, comme le handle Shopify, et elle vivra
 * dans « Diffusion par canal ». La notion de principale n'avait d'ailleurs
 * aucun consommateur — ni la projection Shopify ni le B2B ne lisent le rôle ;
 * elle affirmait une hiérarchie que rien ne consommait.
 */
@Component({
  selector: 'app-visuals-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LangSwitch,
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
  private readonly panels = inject(FoldPanelHostService);

  protected readonly missingHint = computed(() =>
    missingSentence('Des textes alternatifs manquent', this.store.mediaMissing()),
  );

  /**
   * La FORME du fichier, réduite — « 4:3 », « 16:9 », « 1:1 ».
   *
   * La vignette recadre pour que la galerie reste homogène : c'est le bon
   * arbitrage pour comparer des images, mais il cache la forme réelle du
   * fichier. La pastille la rend, sans quoi on découvrirait en boutique qu'un
   * visuel était un portrait.
   *
   * Rien à dire d'une image non mesurée : une pastille vide vaudrait mieux que
   * rien, mais une pastille FAUSSE serait pire que les deux.
   */
  protected ratioOf(slot: MediaSlot): string | undefined {
    const { width, height } = slot;
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
      return undefined;
    }
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;
    // Réduit, un capteur donne parfois « 4288:2848 » : illisible, donc on
    // retombe sur une décimale plutôt que d'afficher une fraction de recensement.
    return w <= 32 && h <= 32 ? `${String(w)}:${String(h)}` : `${(width / height).toFixed(2)}:1`;
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
  /**
   * Ouvre le panneau du texte alternatif — les trois langues d'un coup.
   *
   * Le panneau rend le texte, ou `undefined` s'il a été vidé ; `dismiss()` ne
   * rend rien du tout, et c'est la différence qui compte : annuler ne doit pas
   * effacer ce qui existait.
   */
  protected editAlt(index: number): void {
    const slot = this.store.media()[index];
    if (slot === undefined) {
      return;
    }
    void this.panels
      .open<AltTextPanelData, AltTextPanelResult>(AltTextPanel, {
        data: { url: slot.url, alt: slot.alt },
      })
      .closed.then((result) => {
        // `undefined` = annulé. Écrire alors effacerait ce qu'on venait de
        // renoncer à changer.
        if (result !== undefined) {
          this.store.setMediaAltText(index, result.alt);
        }
      });
  }

  protected pick(files: readonly File[]): void {
    const file = files[0];
    if (file !== undefined) {
      void this.store.uploadMedia(file);
    }
  }
}
