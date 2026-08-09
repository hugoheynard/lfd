import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

/**
 * Page **Réglages** (staff) — coquille de navigation. Un `fold-page-layout`
 * (titre, gouttières, rythme) dont le corps est un `fold-nav-layout` en rail
 * latéral : c'est LUI qui replie la barre à l'horizontale quand la place manque,
 * sur sa propre largeur et non celle du viewport — donc juste, y compris en
 * iframe dans la suite. Le `fold-view-nav` projeté (souligné, confortable, fond
 * transparent — le 3ᵉ rail : app → workspace → vues en page) lit cet état par DI
 * et bascule son orientation seul. Chaque onglet est une sous-page routée :
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
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldNavLayoutComponent, FoldViewNavComponent],
  templateUrl: './reglages-page.html',
})
export class ReglagesPage {
  /**
   * Onglets routés — chaque `link` est relatif à `/reglages`. Icônes prises dans
   * le catalogue **fold** : `FoldIconName` accepte n'importe quelle chaîne, donc
   * un nom emprunté ailleurs compile et n'affiche rien.
   */
  protected readonly tabs: FoldViewNavItem[] = [
    { key: 'activation', label: 'Activation client', link: 'activation', icon: 'completed' },
    {
      key: 'retraits-livraisons',
      label: 'Retraits & livraisons',
      link: 'retraits-livraisons',
      icon: 'briefcase',
    },
    { key: 'commercial', label: 'Commercial', link: 'commercial', icon: 'bell' },
    { key: 'utilisateurs', label: 'Utilisateurs', link: 'utilisateurs', icon: 'user' },
  ];
}
