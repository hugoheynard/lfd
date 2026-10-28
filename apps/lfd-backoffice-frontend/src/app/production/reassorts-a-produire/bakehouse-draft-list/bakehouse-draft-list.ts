import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { BakehouseResupplyDraftView } from '@lfd/contracts';
import { FoldButtonComponent, FoldInlineConfirmComponent } from 'fold-ng';

/** Les mots des deux visées, comme sur les boutons de la carte. */
const TARGET_LABELS = { asap: 'au plus tôt', tomorrow: 'pour demain' } as const;

/**
 * **Les brouillons ouverts du fournil** (`plan-brouillons-du-fournil.md`,
 * Hugo 2026-10-28) : au-dessus de la carte, une ligne par brouillon — son nom,
 * son point, sa visée, son nombre d'articles, qui l'a enregistré et quand.
 * « Reprendre » le charge dans la carte ; « Supprimer » le clôt, confirmé.
 */
@Component({
  selector: 'app-bakehouse-draft-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInlineConfirmComponent],
  templateUrl: './bakehouse-draft-list.html',
  styleUrl: './bakehouse-draft-list.scss',
})
export class BakehouseDraftList {
  readonly drafts = input.required<readonly BakehouseResupplyDraftView[]>();
  /** Le libellé de chaque point, par identifiant. */
  readonly siteLabels = input.required<ReadonlyMap<string, string>>();
  /** Le brouillon chargé dans la carte : il ne se reprend pas deux fois. */
  readonly currentId = input<string | null>(null);
  readonly pending = input(false);

  readonly resumed = output<BakehouseResupplyDraftView>();
  readonly discarded = output<BakehouseResupplyDraftView>();

  protected titleOf(draft: BakehouseResupplyDraftView): string {
    return draft.name ?? 'Sans nom';
  }

  /** « Village · pour demain · 4 articles · Hugo, 28/10 à 14:05 ». */
  protected metaOf(draft: BakehouseResupplyDraftView): string {
    const site = this.siteLabels().get(draft.siteId) ?? 'Point inconnu';
    const count = draft.lines.length;
    const when = new Date(draft.savedAt).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${site} · ${TARGET_LABELS[draft.target]} · ${String(count)} article${count > 1 ? 's' : ''} · ${draft.savedByName}, ${when}`;
  }
}
