import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

/**
 * Page **Réglages** (staff) — coquille de navigation. Un `fold-page-layout`
 * (titre, gouttières, rythme) dont le corps porte un `fold-view-nav` **vertical,
 * souligné, confortable, fond transparent** (le 3ᵉ rail : app → workspace → vues
 * en page) puis le `<router-outlet>`. Chaque onglet est une sous-page routée :
 *
 * - **Activation client** — config des pièces d'activation (masquée / optionnelle
 *   / requise), globale à la plateforme.
 * - **Retraits & livraisons** — les points de retrait (laboratoires), fallback
 *   d'acheminement tant que la livraison n'existe pas.
 * - **Commercial** — les seuils d'alerte du pipeline d'acquisition.
 */
@Component({
  selector: 'app-reglages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldViewNavComponent],
  templateUrl: './reglages-page.html',
  styleUrl: './reglages-page.scss',
})
export class ReglagesPage {
  /** Onglets routés — chaque `link` est relatif à `/reglages`. */
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'activation', label: 'Activation client', link: 'activation', icon: 'check-circle' },
    {
      key: 'retraits-livraisons',
      label: 'Retraits & livraisons',
      link: 'retraits-livraisons',
      icon: 'package',
    },
    { key: 'commercial', label: 'Commercial', link: 'commercial', icon: 'bell' },
  ];
}
