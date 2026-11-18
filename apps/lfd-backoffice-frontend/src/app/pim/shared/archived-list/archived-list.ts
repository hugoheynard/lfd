import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent, FoldDisclosureComponent, FoldInlineConfirmComponent } from 'fold-ng';

/** Une ligne archivée : sa clé de restauration, son nom, et un détail facultatif. */
export interface ArchivedEntry {
  readonly key: string;
  readonly label: string;
  readonly detail?: string | undefined;
}

/**
 * **Les objets archivés d'un référentiel, à part, avec « Restaurer »** — sur le
 * modèle des déclinaisons archivées de la fiche produit. Taux de TVA,
 * contextes de vente, ingrédients, appellations et limites de commande ne se
 * suppriment plus : ils s'archivent, sortent des listes de choix, et reviennent
 * d'ici.
 *
 * Replié par défaut : une archive se consulte, elle ne s'impose pas. Rien
 * n'est rendu quand il n'y en a aucune. Sans le droit d'écrire, la liste se
 * lit sans geste.
 */
@Component({
  selector: 'app-archived-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldDisclosureComponent, FoldInlineConfirmComponent],
  templateUrl: './archived-list.html',
  styleUrl: './archived-list.scss',
})
export class ArchivedList {
  /** Le nom du groupe, au pluriel — « Taux archivés ». Le compte s'y ajoute. */
  readonly title = input.required<string>();
  readonly entries = input.required<readonly ArchivedEntry[]>();
  /** Ce que la restauration fera, dit avant le geste. */
  readonly restoreMessage = input.required<string>();
  readonly canRestore = input(true);
  readonly busy = input(false);

  readonly restore = output<string>();
}
