import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { MediaGallery } from '../../../media-gallery/media-gallery';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from './alt-text-panel/alt-text-panel';
import { ProductFormStore } from '../../product-form-store';

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
  selector: 'app-visuals-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldCalloutComponent, MediaGallery],
  templateUrl: './visuals-form.html',
  styleUrls: ['../form-section.scss'],
})
export class VisualsForm {
  protected readonly store = inject(ProductFormStore);
  private readonly panels = inject(FoldPanelHostService);

  /**
   * L'avertissement de la GALERIE — un seul, au-dessus de la grille.
   *
   * Un message par vignette devenait le motif de fond de la section : répété
   * huit fois, on ne lisait plus que lui, donc plus rien. Ici il compte, il
   * nomme les langues, et les tuiles concernées se signalent par leur liseré.
   */
  protected readonly missingHint = computed(() => {
    const anyEmpty = this.store.media().some((slot) => slot.alt === undefined);
    const missing = missingSentence('Des descriptions manquent', this.store.mediaMissing());
    if (anyEmpty) {
      return missing === undefined
        ? 'Certaines images n’ont aucune description.'
        : `Certaines images n’ont aucune description. ${missing}`;
    }
    return missing;
  });

  /** Les index dont la description est incomplète — la galerie les liserait. */
  protected readonly incompleteIndexes = computed(() =>
    this.store
      .media()
      .flatMap((_, index) => (this.store.mediaAltMissing(index).length > 0 ? [index] : [])),
  );

  /** Les langues qui manquent à CETTE image, nommées ; rien quand tout y est. */
  protected untranslated(index: number): string | undefined {
    const missing = this.store.mediaAltMissing(index).filter((locale) => locale !== SOURCE_LOCALE);
    return missing.length === 0
      ? undefined
      : missing.map((locale) => LOCALE_NAMES[locale]).join(' et ');
  }

  /**
   * Ouvre le panneau du texte alternatif — les trois langues d'un coup.
   *
   * Le panneau rend le texte, ou `undefined` s'il a été vidé ; `dismiss()` ne
   * rend rien du tout, et c'est la différence qui compte : annuler ne doit pas
   * effacer ce qui existait.
   */
  protected editMedia(index: number): void {
    const slot = this.store.media()[index];
    if (slot === undefined) {
      return;
    }
    void this.panels
      .open<AltTextPanelData, AltTextPanelResult>(AltTextPanel, {
        data: { url: slot.url, name: slot.name, alt: slot.alt },
      })
      .closed.then((result) => {
        // `undefined` = annulé. Écrire alors effacerait ce qu'on venait de
        // renoncer à changer.
        if (result === undefined) {
          return;
        }
        if (result.removed === true) {
          this.store.removeMedia(index);
          return;
        }
        this.store.setMediaName(index, result.name);
        this.store.setMediaAltText(index, result.alt);
      });
  }
}
