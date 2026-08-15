import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import { ORDER_ORIGIN_LABELS, type AdminOrderRow } from '@lfd/contracts';
import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';

/**
 * La colonne de gauche : **ce que ce client a déjà commandé**.
 *
 * Une liste faite pour être **cliquée**, pas lue : choisir une commande remplit
 * la colonne du milieu de ses lignes et de leurs quantités. C'est le geste
 * central de l'écran — « refais-moi la même que mardi » est la phrase la plus
 * fréquente au téléphone.
 *
 * Volontairement maigre : numéro, date, montant. L'état d'avancement et le
 * règlement se lisent sur la fiche de la commande ; ici on cherche un **modèle**
 * à reprendre, pas un dossier à instruire.
 */
@Component({
  selector: 'app-historique-commandes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, FoldLoadingStateComponent],
  templateUrl: './historique-commandes.html',
  styleUrl: './historique-commandes.scss',
})
export class HistoriqueCommandes {
  readonly orders = input.required<readonly AdminOrderRow[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);

  readonly select = output<string>();

  protected date(row: AdminOrderRow): string {
    return formatOrderDate(row.placedAt);
  }

  protected total(row: AdminOrderRow): string {
    return formatCents(row.totalCents);
  }

  /** La provenance, sauf quand c'est le cas normal — cf. l'onglet Commandes. */
  protected originPill(row: AdminOrderRow): string | null {
    return row.origin === 'self_service' ? null : ORDER_ORIGIN_LABELS[row.origin];
  }
}
