import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SOURCE_LOCALE, type Locale } from '@lfd/pim-contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { missingSentence } from '../../../../../shared/lang-switch/locale-names';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from '../../../product-form/form-sections/visuals/alt-text-panel/alt-text-panel';
import { MediaGallery } from '../../../media-gallery/media-gallery';
import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../../library-picker/library-picker';
import { CategoryFormStore } from '../../category-form-store';

/**
 * Section **Visuels** d'une famille — composition de sa liste, et rien d'autre.
 *
 * 🔴 **Plus aucun dépôt depuis le 2026-09-23.** Le sien visait
 * `POST /pim/catalogue/media`, une route emportée par le déménagement de la
 * bibliothèque : déposer depuis une famille rendait un **404** que rien ne
 * signalait, l'URL étant construite à la main. Le retrait du geste est donc
 * aussi la correction du défaut.
 *
 * Les octets entrent par la médiathèque, qui est le seul fonds ; une famille
 * RATTACHE une URL. Alimenter et taguer le fonds est un autre métier que
 * composer une famille.
 *
 * La galerie et le panneau de description sont ceux de la fiche produit, à
 * l'identique. Seule la source des données change.
 */
@Component({
  selector: 'app-category-visuals-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldButtonComponent, FoldCalloutComponent, MediaGallery],
  templateUrl: './visuals-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryVisualsForm {
  protected readonly store = inject(CategoryFormStore);
  private readonly panels = inject(FoldPanelHostService);

  /** La langue dans laquelle on LIT les alternatives — propre à cette section :
   *  ni le nom d'un fichier, ni ses dimensions, ni l'image ne se traduisent. */
  protected readonly locale = signal<Locale>(SOURCE_LOCALE);

  /**
   * UN avertissement pour la galerie, pas un par vignette. Répété sur chaque
   * tuile, le message devient le motif de fond de la section : on ne lit plus
   * que lui, donc plus rien. Les tuiles concernées portent un liseré.
   */
  protected readonly missingHint = computed(() =>
    missingSentence('Des descriptions manquent', this.store.media.missing()),
  );

  protected readonly incompleteIndexes = computed(() =>
    this.store.media
      .items()
      .flatMap((_, index) => (this.store.media.missingOf(index).length > 0 ? [index] : [])),
  );

  /**
   * Ouvre le panneau d'un visuel — **son retrait**, et rien d'autre.
   *
   * 🔴 Il portait le nom et les trois alternatives jusqu'au 2026-09-23 ; ils
   * décrivent l'image, qui est partagée, et se saisissent désormais dans la
   * médiathèque. Une famille n'a pas non plus d'usage à choisir : rien sous
   * `pim/channels/` ne consulte le rôle d'un visuel de famille, et offrir le
   * choix ferait décider pour rien.
   *
   * Le panneau rend `undefined` quand on ANNULE, et c'est la différence qui
   * compte : renoncer ne doit rien écrire.
   */
  protected edit(index: number): void {
    const slot = this.store.media.items()[index];
    if (slot === undefined) {
      return;
    }
    void this.panels
      .open<AltTextPanelData, AltTextPanelResult>(AltTextPanel, {
        data: { url: slot.url },
      })
      .closed.then((result) => {
        if (result?.removed === true) {
          this.store.media.remove(index);
        }
      });
  }

  /**
   * Ouvre la médiathèque et rattache ce qu'on y retient.
   *
   * 🔴 Le SEUL chemin par lequel un visuel entre sur une famille. Le panneau ne
   * dépose pas : il désigne, et renoncer ne laisse rien derrière.
   */
  protected pickFromLibrary(): void {
    void this.panels
      .open<LibraryPickerData, readonly PickedMedia[]>(LibraryPicker, {
        data: { already: this.store.media.items().map((slot) => slot.url) },
      })
      .closed.then((picked) => {
        if (picked === undefined || picked.length === 0) {
          return;
        }
        this.store.media.addFromLibrary(picked);
      });
  }
}
