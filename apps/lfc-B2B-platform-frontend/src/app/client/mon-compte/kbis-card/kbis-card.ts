import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { MOCK_ACCOUNT } from '../../mock-account';

/**
 * L'extrait du greffe, en TROIS TEMPS.
 *
 * L'état d'abord — il est daté deux fois, et le second l'est PAR QUELQU'UN : le
 * modèle garde qui a certifié, donc on le montre. Une vérification anonyme
 * n'engage personne ; une vérification signée, oui.
 *
 * Le fichier ensuite, la fraîcheur enfin — avec la règle qui explique pourquoi
 * elle compte : un extrait de moins de trois mois est demandé à l'ouverture d'un
 * crédit, jamais à l'inscription.
 */
@Component({
  selector: 'app-kbis-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './kbis-card.html',
  styleUrl: './kbis-card.scss',
})
export class KbisCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly account = MOCK_ACCOUNT;

  protected readonly kbisVerified = computed(() =>
    this.t()
      .account.kbisVerified.replace('{date}', MOCK_ACCOUNT.kbis.verified)
      .replace('{who}', MOCK_ACCOUNT.kbis.verifiedBy),
  );

  protected readonly kbisFiled = computed(() =>
    this.t()
      .account.kbisFiled.replace('{date}', MOCK_ACCOUNT.kbis.filed)
      .replace('{size}', MOCK_ACCOUNT.kbis.size),
  );
}
