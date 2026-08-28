import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ClientContent } from '../client-content.service';
import { LEGAL_YEAR } from './legal-identity';

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
  private readonly content = inject(ClientContent);

  /** Les textes, servis par l'API — le contenu de départ tant qu'elle n'a pas répondu. */
  protected readonly foot = this.content.footer;

  /** L'identité légale, saisie depuis le back-office. Ce qui est vide est OMIS. */
  protected readonly legal = this.content.identity;

  protected readonly year = LEGAL_YEAR;

  /**
   * Les mentions d'immatriculation RENSEIGNÉES, dans l'ordre de la barre.
   *
   * Elles étaient absentes du code parce qu'on n'invente pas un numéro
   * d'immatriculation. Elles ne le sont plus : elles se saisissent, et la barre
   * les montre dès qu'elles existent. Ce qui reste vide ne laisse pas de trou —
   * une barre courte se lit, un tiret qui traîne se remarque.
   */
  protected readonly mentions = computed(() => {
    const id = this.legal();
    return [id.company, id.capital, id.siret, id.rcs, id.vat].filter((value) => value !== '');
  });
}
