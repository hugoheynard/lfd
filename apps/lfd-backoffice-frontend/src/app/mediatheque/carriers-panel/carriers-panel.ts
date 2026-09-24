import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { MediaCarrierView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { MediaLibraryHttpApi } from '../media-library-http-api';

/**
 * Où mène un porteur, et comment il se nomme — une entrée par `kind`.
 *
 * Une table plutôt qu'un ternaire : un porteur de plus est une ligne de plus.
 * Les chemins des fiches et des familles ont été vérifiés dans
 * `pim/pim.routes.ts` le 2026-09-23 : enfants DIRECTS de `pim`, et « familles »
 * se dit `categories` dans l'URL. La vitrine est sous `b2b/contenu` jusqu'au
 * lot 3 du plan `documentation/order/plan-vitrine-enregistrement.md`, qui la
 * déménage en `/vitrine` avec une redirection depuis l'ancienne adresse.
 */
const CARRIER_DESTINATIONS: Readonly<
  Record<
    MediaCarrierView['kind'],
    { readonly word: string; readonly path: (id: string) => readonly string[] }
  >
> = {
  product: { word: 'Fiche', path: (id) => ['/pim', 'produits', id] },
  category: { word: 'Famille', path: (id) => ['/pim', 'categories', id] },
  storefront: { word: 'Vitrine', path: () => ['/b2b', 'contenu', 'vitrine'] },
};

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
  templateUrl: './carriers-panel.html',
  styleUrl: './carriers-panel.scss',
})
export class CarriersPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<void>>(FoldPanelRef);
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly router = inject(Router);

  readonly data = input.required<CarriersPanelData>();

  protected readonly carriers = signal<readonly MediaCarrierView[]>([]);
  protected readonly loading = signal(true);
  protected readonly failure = signal<string | null>(null);

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
      void this.load(url);
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
    void this.router.navigate([...CARRIER_DESTINATIONS[carrier.kind].path(carrier.id)]);
    this.ref.close();
  }

  /** Le mot qui précède le libellé : « Fiche », « Famille », « Vitrine ». */
  protected word(carrier: MediaCarrierView): string {
    return CARRIER_DESTINATIONS[carrier.kind].word;
  }

  protected dismiss(): void {
    this.ref.close();
  }

  private async load(url: string): Promise<void> {
    try {
      this.carriers.set(await this.api.carriersOf(url));
    } catch {
      // Un échec de LECTURE, pas une absence de porteurs. Les confondre ferait
      // croire l'image libre au premier réseau qui tousse — et proposer de la
      // supprimer.
      this.failure.set("La liste des porteurs n'a pas pu être lue.");
    } finally {
      this.loading.set(false);
    }
  }
}
