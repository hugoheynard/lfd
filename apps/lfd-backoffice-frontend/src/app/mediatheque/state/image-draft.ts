import { computed, signal } from '@angular/core';
import { isMediaAltWritten, type FocalPoint, type MediaSeriesView } from '@lfd/pim-contracts';

import type { ImageDescription, ImagePanelResult } from '../rules/image-description';
import { sameDescription } from '../rules/image-description';
import { AltDraft } from './alt-draft';
import { SeriesChoice } from './series-choice';
import { TagEditor } from './tag-editor';

/**
 * **La description d'une image, en saisie** — ce que le panneau « Décrire une
 * image » montre et modifie : l'image à l'écran, son étiquette, ses
 * alternatives, son point, ses mots-clés, sa série, et ce qui était écrit en
 * arrivant (la référence de « modifié »).
 *
 * Une instance par panneau, comme {@link AltDraft} : l'état d'une saisie
 * appartient à l'écran qui la porte, pas à l'application.
 */
export class ImageDraft {
  /** L'image à l'écran — celle de l'ouverture, puis celle où l'on a navigué. */
  readonly shown = signal<ImageDescription | null>(null);
  /** Ce qui était écrit en arrivant sur l'image : la référence de « modifié ». */
  private readonly origin = signal<ImagePanelResult | null>(null);

  readonly label = signal('');
  /** Les alternatives en saisie, les trois langues ensemble. */
  readonly alt = new AltDraft();
  readonly focal = signal<FocalPoint | null>(null);
  readonly tagEditor: TagEditor;
  readonly seriesChoice: SeriesChoice;

  readonly dirty = computed(() => {
    const origin = this.origin();
    return origin !== null && !sameDescription(origin, this.result());
  });

  constructor(
    vocabulary: () => readonly string[],
    seriesChoices: () => (() => readonly MediaSeriesView[]) | undefined,
  ) {
    this.tagEditor = new TagEditor(vocabulary);
    this.seriesChoice = new SeriesChoice(seriesChoices);
  }

  /** Arrive sur une image : tout repart de ce qu'elle porte. */
  load(image: ImageDescription): void {
    this.shown.set(image);
    this.label.set(image.name);
    // L'alternative de repli EST l'URL quand personne n'a écrit (le serveur
    // le dit ainsi). L'afficher dans le champ ferait croire à une phrase
    // rédigée, et la première sauvegarde la figerait.
    this.alt.text.set(isMediaAltWritten(image.alt, image.url) ? image.alt : { fr: '' });
    this.focal.set(image.focal);
    this.tagEditor.reset(image.tags);
    this.seriesChoice.reset(image.series);
    this.origin.set(this.result());
  }

  /** Ce que la saisie écrirait, tel que le serveur le reçoit. */
  result(): ImagePanelResult {
    const text = this.alt.text();
    const url = this.shown()?.url ?? '';
    return {
      url,
      name: this.label().trim(),
      // Une source vide veut dire « pas d'alternative » : le serveur retombera
      // sur l'URL, qui se VOIT. Les traductions partent avec elle : une
      // alternative italienne sans français n'est rattachée à rien.
      alt: isMediaAltWritten(text, url) ? text : { fr: '' },
      focal: this.focal(),
      tags: this.tagEditor.tags(),
      seriesId: this.seriesChoice.current()?.id ?? null,
    };
  }
}
