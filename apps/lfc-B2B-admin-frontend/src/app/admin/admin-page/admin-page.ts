import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldViewNavItem,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

/**
 * **Admin** — ce qui se règle sur les GENS, par opposition aux Réglages, qui
 * portent sur le commerce (retraits, catalogue, tarification, facturation).
 *
 * Deux vues qui vivaient chacune ailleurs, et mal :
 *
 * - **Utilisateurs** était rangé sous Réglages par commodité, alors qu'il exige
 *   `staff:read` — la seule ressource que le catalogue réserve aux
 *   administrateurs. Il fallait un garde d'exception pour l'y tenir.
 * - **Accès à remettre** occupait une entrée du menu principal, à côté de
 *   destinations qu'on ouvre vingt fois par jour, pour un geste rare.
 *
 * Les deux répondent à la même question — qui entre, et avec quoi — d'où le
 * bouclier. Sa pastille remonte au menu principal, donc rien ne se perd à
 * l'avoir rangé d'un cran plus bas.
 */
@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldPageLayoutComponent, FoldNavLayoutComponent, FoldViewNavComponent],
  templateUrl: './admin-page.html',
})
export class AdminPage {
  private readonly permissions = inject(PermissionsStore);

  /**
   * Chaque onglet porte le droit qui l'ouvre, et la liste se filtre dessus :
   * ranger deux écrans sous un même titre ne leur donne pas le même mur.
   * Montré sans le droit, l'onglet offrait une porte fermée à clé — on
   * cliquait, la page s'ouvrait, et chaque appel rendait 403.
   */
  private readonly allTabs: readonly (FoldViewNavItem & { readonly needs: StaffPermission })[] = [
    {
      key: 'acces-en-attente',
      label: 'Accès à remettre',
      link: 'acces-en-attente',
      icon: 'shield',
      needs: 'companies:read',
    },
    {
      key: 'utilisateurs',
      label: 'Utilisateurs',
      link: 'utilisateurs',
      icon: 'user',
      needs: 'staff:read',
    },
    {
      key: 'journal',
      label: 'Journal',
      link: 'journal',
      icon: 'timeline',
      needs: 'activity:read',
    },
  ];

  protected readonly tabs = computed<FoldViewNavItem[]>(() =>
    this.allTabs.filter((tab) => this.permissions.can(tab.needs)).map(({ needs, ...tab }) => tab),
  );
}
