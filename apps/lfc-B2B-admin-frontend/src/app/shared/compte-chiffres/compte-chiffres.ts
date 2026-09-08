import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldCardComponent } from 'fold-ng';
import type { CustomerStats } from '@lfd/contracts';

import {
  euros,
  trendLabel,
  trendTone,
} from '../../commercial/calendrier/customer-sheet/customer-format';

/**
 * **Le compte en chiffres** — quatre cartes, et pas cinq : au-delà on ne les lit
 * plus, on les compte.
 *
 * ## Pourquoi des cartes ici, alors que la tarification en refuse
 *
 * La ligne de synthèse de la tarification argumente contre les tuiles, et elle a
 * raison **chez elle** : ses cinq compteurs comptent tous la même chose — des
 * articles —, et une ligne de base commune les rend comparables d'un balayage.
 *
 * Ici les quatre chiffres n'ont ni la même unité ni le même ordre de grandeur :
 * des euros cumulés, un nombre de commandes, un engagement, un panier moyen. Les
 * aligner sur une ligne inviterait à les comparer, ce qui n'a aucun sens. Le
 * cadre d'une carte dit « une mesure », et c'est exactement ce qu'on veut dire.
 *
 * ## Dans `shared/`, et pas dans la fiche
 *
 * Deux zones l'affichent — l'en-tête d'un compte et la fiche rendez-vous — et
 * elles ne se connaissent pas. Le ranger chez l'une aurait fait dépendre l'autre
 * d'un dossier qui ne la concerne pas ; le formatage, lui, reste chez la fiche
 * commerciale, qui le possède.
 *
 * ## Un composant, deux endroits
 *
 * 🔴 Ces quatre chiffres vivaient dans `customer-sheet`, au milieu du tableau de
 * bord. Ils sont remontés dans l'en-tête du compte, où ils sont visibles depuis
 * **les huit onglets** — c'est ce qu'on veut savoir avant d'ouvrir n'importe
 * quelle vue. La fiche rendez-vous les rend au même endroit qu'avant, en
 * appelant ce composant : une seule écriture des libellés et du formatage, deux
 * placements.
 */
@Component({
  selector: 'app-compte-chiffres',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent],
  templateUrl: './compte-chiffres.html',
  styleUrl: './compte-chiffres.scss',
})
export class CompteChiffres {
  readonly stats = input.required<CustomerStats>();

  /**
   * Les cartes sont **posées sur un fond sombre** dans l'en-tête du compte, et
   * sur le papier de la page dans la fiche rendez-vous. Le drapeau ne change que
   * la teinte — jamais le contenu, jamais l'ordre.
   */
  readonly onChrome = input<boolean>(false);

  protected readonly total = computed(() => euros(this.stats().totalSpentCents));
  protected readonly average = computed(() => euros(this.stats().averageTicketCents));

  /** La tendance accompagne le cumul : un total sans direction ne dit qu'un passé. */
  protected readonly trend = computed(() => ({
    label: trendLabel(this.stats().trend),
    tone: trendTone(this.stats().trend),
  }));
}
