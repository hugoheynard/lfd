import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ClientCompany } from '../../client-company.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * LA CARTE DE COMPTE — le compte comme on tiendrait une carte de membre.
 *
 * C'est le seul endroit spectaculaire de l'écran. Le nom occupe TOUTE la
 * largeur, et la pastille d'état monte sur la ligne du sur-titre : une raison
 * sociale longue s'écrit en entier, jamais d'ellipse sur le nom de la maison —
 * c'est la seule chose de cet écran qui appartienne vraiment à celui qui le lit.
 *
 * ## 🔴 Elle affichait le nom d'une AUTRE maison
 *
 * « Brasserie Marchand », « −12 % », « 2 000 € de plafond », « membre depuis
 * février 2024 » : tout était écrit en dur. Quelqu'un de connecté lisait donc le
 * nom de quelqu'un d'autre sur l'écran qui est précisément censé lui dire qui il
 * est chez nous.
 *
 * ## Ce qui a disparu avec la maquette, et pourquoi
 *
 * La carte portait **trois nombres** ; deux n'avaient aucune source.
 *
 * - **La remise** n'existe pas comme un nombre. Un prix négocié vit dans la
 *   mercuriale, article par article — annoncer « −12 % » sur tout le compte
 *   serait faux pour presque chaque ligne.
 * - **Le plafond de crédit** n'existe pas du tout : le modèle le nomme comme une
 *   perspective (« extraire un BillingProfile le jour où ça grossit »).
 * - **La date d'entrée** existe en base mais pas sur le fil : `CompanyView` ne
 *   la porte pas. Elle reviendra le jour où le contrat la portera ; l'inventer
 *   en attendant, c'est ce qu'on vient de retirer.
 *
 * Reste la **référence**, dictable au téléphone, et le **terme de règlement**,
 * qui est un vrai acte commercial. Deux faits valent mieux que cinq affirmations.
 */
@Component({
  selector: 'app-account-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-card.html',
  styleUrl: './account-card.scss',
})
export class AccountCard {
  protected readonly t = inject(ClientCopyService).t;
  protected readonly client = inject(ClientCompany);

  /** La référence, pour la dicter. Vide tant que le compte n'est pas connu. */
  protected readonly reference = computed(() => {
    const company = this.client.company();
    return company === null
      ? ''
      : this.t().account.cardReference.replace('{ref}', company.reference);
  });

  /** Le terme convenu, ou le défaut — qui n'est pas une absence de réglage. */
  protected readonly term = computed(() =>
    this.client.hasDeferredTerm()
      ? this.t().account.cardTermMonthly
      : this.t().account.cardTermOrder,
  );
}
