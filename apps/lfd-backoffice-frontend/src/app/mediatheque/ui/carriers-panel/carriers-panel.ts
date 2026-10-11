import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import type { MediaCarrierView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { carrierPath, carrierWord } from '../../rules/carrier-destinations';
import { MediaCarriersStore } from '../../state/media-carriers';

/** L'image dont on demande les porteurs. */
export interface CarriersPanelData {
  readonly url: string;
  /** Ce que la vignette annonçait — voir la note sur la divergence. */
  readonly label: string;
}

/**
 * Panneau **Qui affiche cette image**.
 *
 * 🔴 Il existe pour rendre le refus de suppression ACTIONNABLE. La carte
 * annonce « 3 emplois » et s'arrêtait là : on empêchait le geste sans donner de
 * quoi le débloquer, ce qui transforme un garde-fou en mur — et pousse à
 * insister plutôt qu'à comprendre.
 *
 * ⚠️ **Un seul nombre à l'écran à la fois.** Le compte de la carte
 * (`item.uses`) et cette liste viennent de deux requêtes : l'une balaie des
 * pages entières et ne charge aucun libellé, l'autre nomme les porteurs d'une
 * seule image. Ils PEUVENT diverger le temps qu'une fiche change. Afficher
 * « 3 » à côté d'une liste de 2 ferait conclure que le compteur ment ; ce
 * panneau ne répète donc pas le compte de la carte, il montre ce qu'il a lu.
 */
@Component({
  selector: 'app-carriers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent],
  providers: [MediaCarriersStore],
  templateUrl: './carriers-panel.html',
  styleUrl: './carriers-panel.scss',
})
export class CarriersPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly router = inject(Router);

  readonly data = input.required<CarriersPanelData>();

  private readonly store = inject(MediaCarriersStore);
  protected readonly carriers = this.store.carriers.asReadonly();
  protected readonly loading = this.store.loading.asReadonly();
  protected readonly failure = this.store.failure.asReadonly();

  /**
   * 🔴 Dans un `effect`, et **jamais dans le constructeur**.
   *
   * Un `input.required()` n'est pas encore posé quand le constructeur tourne :
   * le lire y lève (NG0950). Ce panneau le faisait, et le `catch` de `load()`
   * transformait l'erreur d'Angular en « la liste des porteurs n'a pas pu être
   * lue » — un message qui accuse le réseau pour un défaut de cycle de vie.
   *
   * C'est le motif déjà employé par `image-panel` : l'effet attend que l'entrée
   * existe. Et il n'a pas piégé `library-picker`, dont le constructeur appelle
   * aussi `load()` — parce que ce `load()`-là ne lit rien de `data()`.
   */
  constructor() {
    effect(() => {
      const { url } = this.data();
      void this.store.load(url);
    });
  }

  /**
   * Ouvre le porteur, et FERME le panneau.
   *
   * Le laisser ouvert par-dessus l'écran d'arrivée montrerait la liste des
   * porteurs d'une image au-dessus d'une fiche qu'on vient d'ouvrir pour la
   * corriger — deux sujets, un seul écran.
   */
  protected open(carrier: MediaCarrierView): void {
    void this.router.navigate([...carrierPath(carrier)]);
    this.ref.close();
  }

  /** Le mot qui précède le libellé : « Fiche », « Famille », « Vitrine ». */
  protected word(carrier: MediaCarrierView): string {
    return carrierWord(carrier);
  }

  protected dismiss(): void {
    this.ref.close();
  }
}
