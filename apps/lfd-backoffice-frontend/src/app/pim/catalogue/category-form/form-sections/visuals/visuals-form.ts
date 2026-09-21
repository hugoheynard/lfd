import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SOURCE_LOCALE, type Locale } from '@lfd/pim-contracts';
import { FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { missingSentence } from '../../../../../shared/lang-switch/locale-names';
import { NotifyService } from '../../../../../notify.service';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from '../../../product-form/form-sections/visuals/alt-text-panel/alt-text-panel';
import { MediaGallery } from '../../../media-gallery/media-gallery';
import { CategoryFormStore } from '../../category-form-store';

/**
 * Section **Visuels** d'une famille — dépôt vers la bibliothèque, puis
 * composition de sa liste.
 *
 * Les deux gestes sont volontairement distincts : déposer crée un fichier et ne
 * touche à aucune famille ; enregistrer remplace la liste de CELLE-CI. C'est ce
 * qui permet au même fichier de servir une famille et une fiche sans être déposé
 * deux fois — la bibliothèque `media_asset` est commune aux deux.
 *
 * La galerie et le panneau de description sont ceux de la fiche produit, à
 * l'identique. Seule la source des données change.
 */
@Component({
  selector: 'app-category-visuals-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldCalloutComponent, MediaGallery],
  templateUrl: './visuals-form.html',
  styleUrls: ['../../../product-form/form-sections/form-section.scss'],
})
export class CategoryVisualsForm {
  protected readonly store = inject(CategoryFormStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

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
   * Ouvre le panneau d'un visuel — son nom, ses trois alternatives, son retrait.
   *
   * Le panneau rend `undefined` quand on ANNULE, et c'est la différence qui
   * compte : annuler ne doit pas effacer ce qu'on venait de renoncer à changer.
   */
  protected edit(index: number): void {
    const slot = this.store.media.items()[index];
    if (slot === undefined) {
      return;
    }
    void this.panels
      .open<AltTextPanelData, AltTextPanelResult>(AltTextPanel, {
        data: { url: slot.url, name: slot.name, alt: slot.alt },
      })
      .closed.then((result) => {
        if (result === undefined) {
          return;
        }
        if (result.removed === true) {
          this.store.media.remove(index);
          return;
        }
        this.store.media.rename(index, result.name);
        this.store.media.describe(index, result.alt);
      });
  }

  /** Le dépôt peut échouer — format refusé, fichier trop lourd, réseau. Sans ce
   *  message, la tuile ne paraît simplement jamais et rien ne dit pourquoi. */
  protected async pick(file: File): Promise<void> {
    try {
      await this.store.media.upload(file);
    } catch (caught) {
      this.notify.refused(caught, "Le dépôt de l'image a échoué.");
    }
  }
}
