import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

/**
 * Le bandeau d'un compte **supprimé**, en tête de fiche : quand, par qui, pour
 * quel motif — et le geste qui le rend aux listes. Présentation seule : la
 * fiche le pose quand `archivedAt` est renseigné.
 */
@Component({
  selector: 'app-deleted-account-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './deleted-account-banner.html',
})
export class DeletedAccountBanner {
  /** ISO — l'instant de la suppression. */
  readonly archivedAt = input.required<string>();
  readonly archivedByName = input<string | null>(null);
  readonly reason = input<string | null>(null);

  readonly unarchive = output<void>();

  /**
   * La suite de « Compte supprimé » : la date, puis l'auteur et le motif quand
   * ils sont connus. Composée ici plutôt que dans le gabarit, dont le
   * formatage glisserait une espace avant chaque virgule.
   */
  protected readonly details = computed(() => {
    const parts = [`le ${new Date(this.archivedAt()).toLocaleDateString('fr-FR')}`];
    const by = this.archivedByName();
    if (by !== null) {
      parts.push(`par ${by}`);
    }
    const reason = this.reason();
    if (reason !== null) {
      parts.push(`motif\u00a0: ${reason}`);
    }
    return `${parts.join(', ')}.`;
  });
}
