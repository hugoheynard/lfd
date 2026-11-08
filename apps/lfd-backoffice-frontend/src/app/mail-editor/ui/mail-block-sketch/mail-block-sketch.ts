import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ColumnsBlock, FreeBlock } from '@lfd/mail-blocks';
import { FoldIconComponent } from 'fold-ng';

import { FREE_BLOCK_LABELS } from '../../rules/mail-document-edits';

/**
 * **L'esquisse d'un bloc neuf** : sa forme, rendue sur place, pendant qu'on
 * glisse une carte de la bibliothèque (précision de Hugo du 2026-11-08 :
 * « on le voit en preview entre les éléments où on va le poser »). Un bloc
 * neuf est vide — un titre sans texte, une image pas choisie — et le serveur
 * n'en rendrait presque rien : l'esquisse montre la forme qu'il prendra, sans
 * aucun appel réseau à chaque mouvement du pointeur. Le bloc vient de la même
 * fabrique que le clic (`newLibraryBlock`).
 */
@Component({
  selector: 'app-mail-block-sketch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './mail-block-sketch.html',
  styleUrl: './mail-block-sketch.scss',
  host: { '[attr.data-sketch]': 'block().kind' },
})
export class MailBlockSketch {
  readonly block = input.required<FreeBlock | ColumnsBlock>();

  protected readonly label = computed(() => FREE_BLOCK_LABELS[this.block().kind]);
  protected readonly tone = computed(() => {
    const block = this.block();
    return block.kind === 'callout' ? block.tone : null;
  });
  /** Les colonnes d'une mise en page, à leur largeur de départ (en %). */
  protected readonly widths = computed(() => {
    const block = this.block();
    return block.kind === 'columns' ? block.widths : [];
  });
}
