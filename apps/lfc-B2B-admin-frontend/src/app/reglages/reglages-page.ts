import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { PermissionsStore } from '../auth/permissions.store';

/**
 * Page **Réglages** (staff) — coquille de navigation. Un `fold-page-layout`
 * (titre, gouttières, rythme) dont le corps est un `fold-nav-layout` en rail
 * latéral : c'est LUI qui replie la barre à l'horizontale quand la place manque,
 * sur sa propre largeur et non celle du viewport — donc juste, y compris en
 * iframe dans la suite. Le `fold-view-nav` projeté (souligné, confortable, fond
 * transparent — le 3ᵉ rail : app → workspace → vues en page) lit cet état par DI
 * et bascule son orientation seul. Chaque onglet est une sous-page routée :
 *
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
  private readonly permissions = inject(PermissionsStore);

  /**
   * Onglets routés — chaque `link` est relatif à `/reglages`. Icônes prises dans
   * le catalogue **fold** : `FoldIconName` accepte n'importe quelle chaîne, donc
   * un nom emprunté ailleurs compile et n'affiche rien.
   *
   * Chaque onglet porte le droit qui l'ouvre, et la liste se filtre dessus :
   * ranger cinq écrans sous un même titre ne leur donne pas le même mur.
   * Montré sans le droit, un onglet offre une porte fermée à clé — on clique,
   * la page s’ouvre, et chaque appel rend 403.
   *
   * Ces cinq-là portent tous sur le COMMERCE. Ce qui porte sur les GENS — qui
   * entre, qui tient l'outil — a quitté ces réglages pour le module Admin.
   */
  private readonly allTabs: readonly (FoldViewNavItem & { readonly needs: StaffPermission })[] = [
    {
      key: 'retraits-livraisons',
      label: 'Retraits & livraisons',
      link: 'retraits-livraisons',
      icon: 'briefcase',
      needs: 'settings:read',
    },
    {
      key: 'facturation',
      label: 'Facturation',
      link: 'facturation',
      icon: 'library',
      needs: 'settings:read',
    },
    {
      key: 'commercial',
      label: 'Commercial',
      link: 'commercial',
      icon: 'bell',
      needs: 'growth:read',
    },
  ];

  protected readonly tabs = computed<FoldViewNavItem[]>(() =>
    this.allTabs.filter((tab) => this.permissions.can(tab.needs)).map(({ needs, ...tab }) => tab),
  );
}
