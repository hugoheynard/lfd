import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../copy/client-copy.service';
import { LEGAL_IDENTITY, LEGAL_YEAR } from './legal-identity';

/**
 * Le pied de page de l'app — quatre colonnes et une barre légale.
 *
 * Il peint la MÊME teinte que la barre (`--fold-color-bg-header`) : c'est la
 * règle de région du handoff `navi 2`, et c'est ce qui fait qu'il ferme la page
 * au lieu d'y ajouter un bloc. Il passe sous toute la largeur, rail compris —
 * ce n'est pas une colonne de plus.
 *
 * La colonne « Commander » double la navigation **par intention** et non par
 * rubrique : « Retrait au Labo », « Coursier dans la station » ne sont pas les
 * entrées du menu, ce sont les façons dont on arrive à la même commande.
 *
 * Il n'existe **qu'au bureau**. Sur un téléphone, la navigation pleine page et
 * la carte contact couvrent les mêmes besoins sans imposer 300 px de
 * défilement mort.
 */
@Component({
  selector: 'app-client-foot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './client-foot.html',
  styleUrl: './client-foot.scss',
})
export class ClientFoot {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly legal = LEGAL_IDENTITY;
  protected readonly year = LEGAL_YEAR;
}
