import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPageSectionComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import type {
  ImageDescription,
  ImagePanelData,
  ImagePanelResult,
} from '../../rules/image-description';
import { keyIntent } from '../../rules/image-pointing';
import { AltSection } from '../alt-section/alt-section';
import { FocalSection } from '../focal-section/focal-section';
import { ImageInfoSection } from '../image-info-section/image-info-section';
import { SeriesChip } from '../series-chip/series-chip';
import { TagChip } from '../tag-chip/tag-chip';
import { ImageDraft } from '../../state/image-draft';
import { ImageWalk } from '../../state/image-walk';

/**
 * Panneau **Décrire une image** — son étiquette, ses alternatives, son point,
 * et ses mots-clés (depuis le 2026-10-10 : la bande pose un mot sur beaucoup
 * d'images, le panneau règle tous ceux d'UNE image).
 *
 * 🔴 C'est le SEUL point où ces champs s'écrivent (Hugo, 2026-09-23). Ils
 * décrivaient l'image depuis la fiche produit jusqu'à ce jour-là, et une image
 * étant partagée, une correction faite sur une fiche changeait silencieusement
 * ce qu'une autre affichait.
 *
 * Les trois langues ensemble, et pas une à la fois : une traduction se juge à
 * côté de sa source, pas de mémoire.
 *
 * ⚠️ `disableClose` : Échap et le fond ne referment plus en silence — Échap
 * passe par {@link cancel}, qui demande avant de jeter une saisie. La croix de
 * l'en-tête, elle, ferme sans demander : `fold-panel-header` n'offre pas de
 * veto (`closed` « is not a veto hook », lu dans `fold-ng.d.ts` le 2026-10-10).
 */
@Component({
  selector: 'app-image-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPageSectionComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    AltSection,
    FocalSection,
    ImageInfoSection,
    SeriesChip,
    TagChip,
  ],
  templateUrl: './image-panel.html',
  styleUrl: './image-panel.scss',
  host: { '(keydown)': 'onKey($event)' },
})
export class ImagePanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', disableClose: true };

  private readonly ref = inject<FoldPanelRef<ImagePanelResult>>(FoldPanelRef);

  readonly data = input.required<ImagePanelData>();

  /** La saisie : l'image à l'écran, ce qu'on en écrit, et ce qui y était écrit. */
  private readonly edit = new ImageDraft(
    () => this.data().vocabulary,
    () => this.data().seriesChoices,
  );
  protected readonly shown = this.edit.shown;
  protected readonly label = this.edit.label;
  protected readonly alt = this.edit.alt;
  protected readonly focal = this.edit.focal;
  protected readonly tagEditor = this.edit.tagEditor;
  protected readonly seriesChoice = this.edit.seriesChoice;
  protected readonly dirty = this.edit.dirty;
  /** On a demandé à partir avec une saisie en cours : le pied le demande. */
  protected readonly leaving = signal(false);

  private readonly walk = new ImageWalk(() => this.data().sequence, this.edit);
  protected readonly moving = this.walk.moving;
  protected readonly hasSequence = this.walk.hasSequence;
  protected readonly previous = this.walk.previous;
  protected readonly next = this.walk.next;

  constructor() {
    // 🔴 `untracked` : `load` lit les signaux qu'il écrit (l'état d'origine
    // se calcule par `result()`). Sans lui, l'effet s'abonnait à TOUS — le
    // point, les mots-clés, l'étiquette — et chaque geste rechargeait l'image
    // d'origine par-dessus : rien ne tenait à l'écran (vu le 2026-10-10).
    effect(() => {
      const data = this.data();
      untracked(() => this.load(data));
    });
  }

  protected showCarriers(): void {
    const shown = this.shown();
    if (shown !== null) {
      this.data().showCarriers?.(shown.url);
    }
  }

  /**
   * Passe au remplacement. Fermé tant qu'une saisie est en cours : ouvrir un
   * autre panneau ferme celui-ci, et la saisie serait perdue sans un mot.
   */
  protected replaceImage(): void {
    const shown = this.shown();
    if (shown !== null && !this.dirty()) {
      this.data().replace?.(shown.url);
    }
  }

  /** Passe à l'image voisine — la saisie en cours s'enregistre d'abord, cf. {@link ImageWalk}. */
  protected async go(direction: 'previous' | 'next'): Promise<void> {
    if (await this.walk.go(direction)) {
      this.leaving.set(false);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const intent = keyIntent(event.key, event.target);
    if (intent === null) {
      return;
    }
    event.preventDefault();
    if (intent === 'cancel') {
      this.cancel();
    } else {
      void this.go(intent);
    }
  }

  protected submit(): void {
    if (this.dirty()) {
      this.ref.close(this.edit.result());
    }
  }

  /** Annuler — sans rien demander s'il n'y a rien à perdre. */
  protected cancel(): void {
    if (this.dirty()) {
      this.leaving.set(true);
      return;
    }
    this.ref.close();
  }

  protected discard(): void {
    this.ref.close();
  }

  protected keepEditing(): void {
    this.leaving.set(false);
  }

  private load(image: ImageDescription): void {
    this.edit.load(image);
    this.leaving.set(false);
  }
}
