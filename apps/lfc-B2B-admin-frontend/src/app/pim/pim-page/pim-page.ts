import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { FoldNavLayoutComponent, FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';

/**
 * Les vues du **PIM**.
 *
 * C'était un rail d'application quand le PIM en était une ; c'est le rail
 * TERTIAIRE de fold — app → workspace → vues en page — depuis qu'il est un
 * module. Le rail de l'application n'a qu'une entrée pour lui, et ses vues se
 * rangent dessous, comme celles des Réglages.
 *
 * La table ne porte plus ni titre ni intro : chaque vue est une page complète
 * qui écrit les siens, avec ses actions. Les répéter ici les affichait deux
 * fois — c'était l'ancien prix de la barre d'onglets horizontale, qui devait
 * bien annoncer où l'on venait d'arriver.
 *
 * `needs` n'y figure que là où la vue ne se contente PAS de `catalog:read`, le
 * droit qui ouvre déjà le PIM : aujourd'hui la seule est le référentiel fiscal,
 * qui a sa propre ressource. Répéter `catalog:read` sur les six autres serait
 * une condition toujours vraie, donc jamais relue.
 */
interface PimTab extends FoldViewNavItem {
  readonly needs?: StaffPermission;
}

const TABS: readonly PimTab[] = [
  { key: 'produits', label: 'Produits', link: 'produits', icon: 'product' },
  { key: 'categories', label: 'Catégories', link: 'categories', icon: 'category' },
  { key: 'tva', label: 'Taux de TVA', link: 'tva', icon: 'tax', needs: 'tax:read' },
  { key: 'collections', label: 'Collections', link: 'collections', icon: 'collections' },
  { key: 'publication', label: 'Publication', link: 'publication', icon: 'publish' },
  { key: 'emplacements', label: 'Emplacements', link: 'emplacements', icon: 'places' },
  { key: 'integration', label: 'Intégrations', link: 'integration', icon: 'integrations' },
];

/**
 * **Le PIM**, section du back-office.
 *
 * Il fut une application à part, ouverte en iframe dans le shell. Ce qui le
 * justifiait est tombé pièce par pièce — son backend, son audience, sa base —
 * et ce qui restait n'était plus une frontière mais de la duplication.
 *
 * La coquille se réduit à la navigation : le rail replie tout seul, chaque vue
 * routée est une page à part entière. Rien à calculer sur l'URL — `fold-view-nav`
 * rend de vrais `<a routerLink>` et tient l'état actif lui-même.
 */
@Component({
  selector: 'app-pim-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldNavLayoutComponent, FoldViewNavComponent],
  templateUrl: './pim-page.html',
  styleUrl: './pim-page.scss',
})
export class PimPage {
  private readonly permissions = inject(PermissionsStore);

  /** Le rail ne montre pas une vue dont la route refusera l'entrée. */
  protected readonly tabs = computed<FoldViewNavItem[]>(() =>
    TABS.filter((tab) => tab.needs === undefined || this.permissions.can(tab.needs)).map(
      ({ needs, ...tab }) => tab,
    ),
  );
}
