import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { MediaGallery } from '../../../media-gallery/media-gallery';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from './alt-text-panel/alt-text-panel';
import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from './library-picker/library-picker';
import { ProductFormStore } from '../../product-form-store';

/**
 * Panneau **Visuels** — dépôt de fichier vers la bibliothèque média, puis
 * composition de la liste du produit.
 *
 * Les deux gestes sont volontairement distincts : déposer crée un fichier et ne
 * touche à aucune fiche ; enregistrer remplace la liste entière du produit.
 *
 * 🔴 **Ce JSDoc a affirmé le contraire jusqu'au 2026-09-23**, et ses deux
 * moitiés étaient fausses. Il disait : « il n'y a ni "principale" ni rôle à
 * choisir ici […] ni la projection Shopify ni le B2B ne lisent le rôle ».
 *
 * La vitrine du canal B2B cherche **précisément** le `hero`
 * (`channels/b2b-platform/products/showcase.ts`), et Shopify est sorti du dépôt
 * le 2026-09-21. Conséquence mesurée : aucun produit ne portait de `hero`, donc
 * la vitrine n'a jamais montré la moindre image. Une phrase qui justifiait de
 * ne rien construire, par l'état d'un fichier que personne n'a rouvert.
 *
 * **On choisit donc ici l'USAGE d'un visuel** — les cinq, depuis le lot 5 — et
 * on peut prendre une image déjà déposée dans la médiathèque plutôt que d'en
 * redéposer une : on tague à la source, on attribue à l'usage.
 */
@Component({
  selector: 'app-visuals-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldButtonComponent, FoldCalloutComponent, MediaGallery],
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
        data: {
          url: slot.url,
          name: slot.name,
          alt: slot.alt,
          role: slot.role,
        },
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
        if (result.role !== undefined) {
          this.store.setMediaRole(index, result.role);
        }
      });
  }

  /**
   * Ouvre la médiathèque et ajoute ce qu'on y retient.
   *
   * 🔴 Aucun dépôt : ces octets sont déjà chez nous. C'est le renversement du
   * modèle — une image entrait jusqu'ici dans le catalogue PAR une fiche, et la
   * retrouver demandait de se souvenir de laquelle.
   *
   * Renoncer (`dismiss`) rend `undefined` et n'ajoute rien ; une liste vide ne
   * peut pas arriver, le panneau gardant son bouton fermé tant que rien n'est
   * retenu.
   */
  protected pickFromLibrary(): void {
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: this.store.media().map((slot) => slot.url) },
      })
      .closed.then((picked) => {
        if (picked === undefined || picked.length === 0) {
          return;
        }
        this.store.addFromLibrary(picked);
      });
  }
}
