import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ShortcutRow } from '../shortcut-row/shortcut-row';

/** Ce qu'une des deux cartes dit — deux lignes, et rien de plus. */
export interface ShortcutCard {
  readonly title: string;
  readonly sub: string;
}

/**
 * **LES DEUX RACCOURCIS** de la maquette du 2026-09-20 : « Ou reprenez » et
 * « Je visite la boutique », côte à côte sous les portes.
 *
 * Un composant et non deux `app-shortcut-row` posées dans l'écran, pour deux
 * raisons qui vont ensemble :
 *
 * - **c'est UN objet de la référence** — une rangée qui se plie, dont les deux
 *   cartes se partagent la largeur. Leur base de flex appartient donc à la
 *   rangée, pas à l'écran qui l'accueille ;
 * - **l'accueil a un budget CSS de 10 kB qui est une ERREUR**, et il y était
 *   déjà au pixel près. Les deux règles de cette rangée l'ont fait échouer de
 *   178 octets (2026-09-20). C'est le même geste que pour `service-doors`, et
 *   la même raison : un objet à soi porte ses styles, et son budget avec.
 *
 * Les deux cartes sont FACULTATIVES et indépendantes : « reprenez » n'existe
 * que s'il y a une commande à reprendre, et la sortie vers la boutique que là
 * où le bandeau — qui porte déjà la sienne — est absent.
 */
@Component({
  selector: 'app-shop-shortcuts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShortcutRow],
  templateUrl: './shop-shortcuts.html',
  styleUrl: './shop-shortcuts.scss',
})
export class ShopShortcuts {
  readonly again = input<ShortcutCard | null>(null);
  /** Le mot d'amorce et celui du bouton de « reprenez ». */
  readonly againLead = input.required<string>();
  readonly againAction = input.required<string>();

  readonly browseCard = input<ShortcutCard | null>(null);

  readonly reordered = output<void>();
  readonly browsed = output<void>();
}
