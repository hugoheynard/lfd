import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldViewNavComponent,
  type FoldIconName,
  type FoldViewNavItem,
} from 'fold-ng';

import { narrowViewport } from '../../shared/viewport/narrow-viewport';

/** Un onglet, plus ce que la page doit en dire — titre et intro vivent ICI. */
interface PimTab extends FoldViewNavItem {
  readonly link: string;
  /** Le fragment qui allume l'onglet, quand il diffère du lien. */
  readonly match?: string;
  readonly icon: FoldIconName;
  readonly description: string;
}

/** La vue par défaut — `/pim` y redirige, et c'est le repli du calcul. */
const PRODUITS: PimTab = {
  key: 'produits',
  label: 'Produits',
  link: 'produits',
  icon: 'grid',
  description: 'Le catalogue : ce qu’on vend, sous quelle forme et à quel prix.',
};

/**
 * Les vues du référentiel.
 *
 * C'était un **rail** quand le référentiel était une app ; c'est une barre
 * d'onglets depuis qu'il est un module. Le rail de l'application n'a qu'une
 * entrée pour lui — « Référentiel » — et ses vues se rangent dessous, comme
 * celles du poste de travail commercial. Deux rails superposés, c'était
 * exactement ce que l'iframe imposait et qu'on ne veut plus.
 *
 * **Une seule table**, comme pour Commercial : elle alimente la barre ET
 * l'en-tête de page, ce qui rend impossible qu'un titre et son onglet divergent.
 */
const TABS: PimTab[] = [
  PRODUITS,
  {
    key: 'categories',
    label: 'Catégories',
    link: 'categories',
    icon: 'folder',
    description: 'L’arborescence qui range le catalogue, et que la boutique suit.',
  },
  {
    key: 'tva',
    label: 'Régimes de TVA',
    link: 'tva',
    icon: 'sliders',
    description: 'Les taux applicables, et ce qu’ils qualifient.',
  },
  {
    key: 'collections',
    label: 'Collections',
    link: 'collections',
    icon: 'org-chart',
    description: 'Des regroupements transverses, indépendants de l’arborescence.',
  },
  {
    key: 'publication',
    label: 'Publication',
    link: 'publication',
    icon: 'upload',
    description: 'Ce qui part vers les canaux, et ce qui en revient.',
  },
  {
    key: 'emplacements',
    label: 'Emplacements',
    link: 'emplacements',
    icon: 'company',
    description: 'Où l’on produit, où l’on retire.',
  },
  {
    key: 'integration',
    label: 'Intégrations',
    link: 'integration',
    icon: 'shopify',
    description: 'Les canaux branchés, leur état et leurs réconciliations.',
  },
  {
    key: 'documentation',
    label: 'Documentation',
    link: 'documentation',
    icon: 'library',
    description: 'Le mode d’emploi du référentiel, écrit pour ceux qui le tiennent.',
  },
  {
    key: 'reglages',
    label: 'Réglages',
    link: 'reglages',
    icon: 'settings',
    description: 'Ce qui se règle une fois et se subit ensuite.',
  },
];

/**
 * **Le référentiel produit**, section du back-office.
 *
 * Il fut une application à part, ouverte en iframe dans le shell. Ce qui le
 * justifiait est tombé pièce par pièce — son backend, son audience, sa base —
 * et ce qui restait n'était plus une frontière mais de la duplication.
 */
@Component({
  selector: 'app-pim-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, FoldNavLayoutComponent, FoldPageLayoutComponent, FoldViewNavComponent],
  templateUrl: './pim-page.html',
  styleUrl: './pim-page.scss',
})
export class PimPage {
  private readonly router = inject(Router);

  /** Barre repliée en accordéon d'icônes sur un écran étroit — cf. Commercial. */
  protected readonly navCollapsed = narrowViewport();

  protected readonly tabs: FoldViewNavItem[] = TABS;

  /** L'URL courante — la seule source de vérité de l'onglet actif. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** La vue affichée. Repli sur la première : `/pim` seul y redirige. */
  protected readonly current = computed<PimTab>(() => {
    const url = this.url();
    return TABS.find((tab) => url.includes(`/pim/${tab.match ?? tab.link}`)) ?? PRODUITS;
  });
}
