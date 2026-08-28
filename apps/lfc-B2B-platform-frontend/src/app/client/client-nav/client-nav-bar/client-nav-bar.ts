import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientNav } from '../client-nav.service';

/**
 * La SOUS-BARRE : les cinq destinations, en permanence, sous la barre de marque.
 *
 * C'est la disposition recommandée par la réf sur les trois construites (rail
 * latéral, sous-barre, onglets dans la barre) : elle rend au contenu les 264 px
 * qu'aurait pris un rail, et c'est la seule des trois où le menu garde sa voix
 * typographique — capitales, filet beurre sous l'actif — tout en étant
 * horizontale.
 *
 * Elle est PROJETÉE dans la bande `subheader` de `fold-app-shell` : c'est le
 * shell qui la place et la marque comme chrome, exactement comme il place la
 * barre. Une bande posée dans le contenu aurait défilé avec lui, serait passée
 * sous un panneau, et n'aurait plus été du chrome que de nom.
 *
 * Ce qu'elle ne porte pas, et c'est voulu (`07-accueil-connecte.md`) : pas de
 * numéros `01`–`05` — ils alignent une verticale, pas une bande, et coûtent
 * ~130 px pour rien ; pas les liens « la maison » ; pas la déconnexion, qui est
 * une action de compte. Les compteurs y sont COURTS : seul le menu pleine page
 * a la largeur d'écrire `7 · 13,70 €`.
 */
@Component({
  selector: 'app-client-nav-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './client-nav-bar.html',
  styleUrl: './client-nav-bar.scss',
})
export class ClientNavBar {
  protected readonly nav = inject(ClientNav);
  protected readonly t = inject(ClientCopyService).t;
  private readonly router = inject(Router);

  protected readonly current = computed(() => this.router.url.split('?')[0] ?? '');
}
