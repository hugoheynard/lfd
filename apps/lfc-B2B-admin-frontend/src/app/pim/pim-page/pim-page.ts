import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FoldNavLayoutComponent, FoldViewNavComponent, type FoldViewNavItem } from 'fold-ng';

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
 */
const TABS: readonly FoldViewNavItem[] = [
  { key: 'produits', label: 'Produits', link: 'produits', icon: 'grid' },
  { key: 'categories', label: 'Catégories', link: 'categories', icon: 'folder' },
  { key: 'tva', label: 'Régimes de TVA', link: 'tva', icon: 'sliders' },
  { key: 'collections', label: 'Collections', link: 'collections', icon: 'org-chart' },
  { key: 'publication', label: 'Publication', link: 'publication', icon: 'upload' },
  { key: 'emplacements', label: 'Emplacements', link: 'emplacements', icon: 'company' },
  { key: 'integration', label: 'Intégrations', link: 'integration', icon: 'shopify' },
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
  protected readonly tabs = TABS;
}
