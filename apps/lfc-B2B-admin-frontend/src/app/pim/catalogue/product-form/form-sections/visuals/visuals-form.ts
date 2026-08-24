import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import {
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldFileDropzoneComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { LangSwitch } from '../../../../../shared/lang-switch/lang-switch';
import { SOURCE_LOCALE } from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from '../../../../../shared/lang-switch/locale-names';
import {
  AltTextPanel,
  type AltTextPanelData,
  type AltTextPanelResult,
} from './alt-text-panel/alt-text-panel';
import { ProductFormStore } from '../../product-form-store';
import type { MediaSlot } from '../../../product-http-api';

/** Le plus grand diviseur commun — pour réduire un ratio à sa forme lisible. */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Le format, tel qu'on le nomme — « image/jpeg » est un type MIME, pas un mot. */
function formatOf(contentType: string): string {
  const subtype = contentType.split('/')[1] ?? contentType;
  return subtype.toUpperCase();
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
  selector: 'app-visuals-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangSwitch, FoldButtonIconComponent, FoldCalloutComponent, FoldFileDropzoneComponent],
  templateUrl: './visuals-form.html',
  styleUrls: ['../form-section.scss', './visuals-form.scss'],
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

  /** Cette image a-t-elle un trou — pas de description, ou pas dans une langue ? */
  protected incomplete(index: number): boolean {
    return this.store.mediaAltMissing(index).length > 0;
  }

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

  /**
   * Résolution, poids, format — ce qu'on a CONSTATÉ dans les octets au dépôt.
   *
   * Le repli couvre les visuels d'avant la mesure, pas des images d'ailleurs :
   * tout fichier entre par le dépôt et vit chez nous. On dit qu'on ne sait pas
   * plutôt que d'inventer « 0 × 0 ».
   */
  protected metaOf(slot: MediaSlot): string {
    const { width, height, bytes, contentType } = slot;
    if (typeof width !== 'number' || typeof height !== 'number') {
      return 'Dimensions inconnues';
    }
    const parts = [`${String(width)} × ${String(height)}`];
    if (typeof bytes === 'number') {
      parts.push(formatBytes(bytes));
    }
    if (typeof contentType === 'string' && contentType !== '') {
      parts.push(formatOf(contentType));
    }
    return parts.join(' · ');
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

  protected pick(files: readonly File[]): void {
    const file = files[0];
    if (file !== undefined) {
      void this.store.uploadMedia(file);
    }
  }
}
