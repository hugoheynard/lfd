import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent, type FoldIconName } from 'fold-ng';

/**
 * Le registre d'un raccourci — ce qu'il pèse sur l'écran.
 *
 * `warm` appelle (l'aplat de beurre intense), `card` propose (la carte crème),
 * `draft` rappelle (le trait pointillé, parce qu'il parle d'une commande déjà
 * passée). La réf donne le ton chaud à « je visite la boutique » et non l'encre :
 * sous un puits d'encre, un second bloc d'encre se serait lu comme sa suite.
 */
export type ShortcutTone = 'warm' | 'card' | 'draft';

/**
 * Une ligne d'action sous les deux portes : visiter la boutique, retirer une
 * commande prête, refaire celle de samedi.
 *
 * Elles ont la même anatomie — une tuile d'icône, un titre, une sous-ligne, une
 * sortie à droite — et ne diffèrent que par leur poids. C'est donc un seul
 * composant avec un registre, et pas trois cartes qui se ressemblent.
 */
@Component({
  selector: 'app-shortcut-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[attr.data-tone]': 'tone()' },
  templateUrl: './shortcut-row.html',
  styleUrl: './shortcut-row.scss',
})
export class ShortcutRow {
  readonly tone = input<ShortcutTone>('card');
  readonly icon = input.required<FoldIconName>();
  readonly title = input.required<string>();
  readonly sub = input.required<string>();

  /** Le mot de la sortie. Sans lui, c'est un chevron : « ça continue ». */
  readonly action = input<string | null>(null);

  readonly opened = output<void>();
}
