import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { MediaGallery } from '../../../media-gallery/media-gallery';

import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from './alt-text-panel/alt-text-panel';
import {
  LibraryPicker,
  type LibraryPickerData,
  type PickedMedia,
} from '../../../library-picker/library-picker';
import { singleRoleHolders } from '../../../media-usages';
import { ProductFormStore } from '../../product-form-store';

/**
 * Panneau **Visuels** — composition de la liste du produit, et rien d'autre.
 *
 * 🔴 **Plus aucun dépôt ici depuis le 2026-09-23.** Les octets entrent par la
 * médiathèque, qui est le seul fonds ; la fiche ne fait que RATTACHER une URL,
 * exactement comme une ligne de commande B2B porte un SKU du référentiel sans
 * le posséder. Le sélecteur porte le dépôt pour que le parcours reste d'un
 * seul geste.
 *
 * 🔴 **Ce JSDoc a affirmé le contraire jusqu'au 2026-09-23**, et ses deux
 * moitiés étaient fausses. Il disait : « il n'y a ni "principale" ni rôle à
 * choisir ici […] ni la projection de l'ancien canal ni le B2B ne lisent le rôle ».
 *
 * La vitrine du canal B2B cherche **précisément** le `hero`
 * (`channels/b2b-platform/products/showcase.ts`), et l'ancien canal de vente en ligne est sorti du dépôt
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
  imports: [FoldButtonComponent, FoldCalloutComponent, MediaGallery],
  templateUrl: './visuals-form.html',
  styleUrls: ['../form-section.scss'],
})
export class VisualsForm {
  protected readonly store = inject(ProductFormStore);
  private readonly panels = inject(FoldPanelHostService);

  /** Les images décochées de partout, dites — elles ne partent pas au serveur. */
  protected readonly unassignedSentence = computed(() => {
    const count = this.store.unassignedMedia().length;
    return count === 1
      ? "Une image n'a aucun usage : elle ne s'enregistrera pas avec la fiche. Donnez-lui un usage ou retirez-la."
      : `${String(count)} images n'ont aucun usage : elles ne s'enregistreront pas avec la fiche. Donnez-leur un usage ou retirez-les.`;
  });

  /**
   * Ouvre le panneau d'un visuel : son USAGE, et son retrait.
   *
   * 🔴 Plus d'étiquette ni de texte alternatif depuis le 2026-09-23. Ils
   * décrivent l'image — qui est partagée — et une correction faite ici
   * changeait silencieusement ce qu'une autre fiche affichait. Ils se
   * saisissent dans la médiathèque, qui en est le seul point.
   *
   * Une image paraît UNE fois (2026-10-18) : l'index est celui de la galerie
   * regroupée, et le panneau rend la liste entière de ses usages.
   *
   * Le panneau rend `undefined` quand on annule, et c'est la différence qui
   * compte : renoncer ne doit rien écrire.
   */
  protected editMedia(index: number): void {
    const image = this.store.mediaImages()[index];
    if (image === undefined) {
      return;
    }
    void this.panels
      .open<AltTextPanelData, AltTextPanelResult>(AltTextPanel, {
        data: {
          url: image.url,
          roles: image.roles,
          holders: singleRoleHolders(this.store.mediaImages(), image.url),
          width: image.width,
          height: image.height,
        },
      })
      .closed.then((result) => {
        if (result === undefined) {
          return;
        }
        if (result.removed === true) {
          this.store.removeMediaImage(image.url);
          return;
        }
        if (result.roles !== undefined) {
          this.store.setMediaRoles(image.url, result.roles);
        }
      });
  }

  /**
   * Ouvre la médiathèque et ajoute ce qu'on y retient.
   *
   * 🔴 C'est le SEUL chemin par lequel un visuel entre sur une fiche. Le
   * panneau sait aussi déposer : une image neuve va d'abord au fonds, puis en
   * revient rattachée — une fiche ne reçoit jamais d'octets.
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
