import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import type { AdminOrderRow } from '@lfd/contracts';
import { OrderRow } from '@lfd/b2b-ui/order';

/**
 * La colonne de gauche : **ce que ce client a déjà commandé**.
 *
 * Une liste faite pour être **cliquée**, pas lue : choisir une commande remplit
 * la colonne du milieu de ses lignes et de leurs quantités. C'est le geste
 * central de l'écran — « refais-moi la même que mardi » est la phrase la plus
 * fréquente au téléphone.
 *
 * Les rangées sont celles de l'onglet Commandes de la fiche, en densité
 * **compacte** : ici on cherche un modèle à reprendre, pas un dossier à
 * instruire. L'état d'avancement et le règlement se lisent sur la commande.
 */
@Component({
  selector: 'app-historique-commandes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, FoldLoadingStateComponent, OrderRow],
  templateUrl: './historique-commandes.html',
  styleUrl: './historique-commandes.scss',
})
export class HistoriqueCommandes {
  readonly orders = input.required<readonly AdminOrderRow[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);

  readonly select = output<string>();
}
