import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ClientCopyService } from '../../copy/client-copy.service';
import { MOCK_ACCOUNT } from '../../mock-account';

/**
 * LA CARTE DE COMPTE — le compte comme on tiendrait une carte de membre.
 *
 * C'est le seul endroit spectaculaire de l'écran, et il ne contient **aucune
 * donnée nouvelle** : seulement celles qui font qu'on est content d'être client.
 * La remise, le terme et le plafond en trois nombres — la promesse commerciale
 * du compte, lisible en une seconde.
 *
 * Le nom occupe TOUTE la largeur, et la pastille d'état monte sur la ligne du
 * sur-titre. Une raison sociale longue s'écrit en entier : jamais d'ellipse sur
 * le nom de la maison — c'est la seule chose de cet écran qui appartienne
 * vraiment à celui qui le lit.
 */
@Component({
  selector: 'app-account-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-card.html',
  styleUrl: './account-card.scss',
})
export class AccountCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly account = MOCK_ACCOUNT;

  protected readonly since = computed(() =>
    this.t()
      .account.cardSince.replace('{month}', MOCK_ACCOUNT.since)
      .replace('{ref}', MOCK_ACCOUNT.reference),
  );
}
