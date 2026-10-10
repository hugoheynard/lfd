import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/**
 * **La pastille d'un mot-clé** — la même partout : la bande, la tuile, le
 * panneau de l'image.
 *
 * 🔴 Applicative faute de primitive : `fold-badge` n'a qu'un `content` texte,
 * sans état armé, sans compte, sans bouton de retrait (vérifié dans
 * `fold-ng.d.ts` le 2026-10-10). Le jour où fold porte une pastille
 * interactive, celle-ci se remplace.
 *
 * Deux gestes, chacun son bouton : `pressable` fait de la pastille le bouton
 * qui ARME, `removable` ajoute le × qui retire. Deux cibles distinctes, parce
 * qu'un seul bouton qui retirerait au clic ferait d'une hésitation un retrait.
 *
 * Le slot `[chipAction]` loge un déclencheur DANS la pastille (le menu de la
 * bande) : une seule forme pill, plutôt qu'un « ⋮ » détaché après chaque mot.
 */
@Component({
  selector: 'app-tag-chip',
  imports: [FoldIconComponent],
  templateUrl: './tag-chip.html',
  styleUrl: './tag-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-armed]': 'armed()',
    '[class.is-fresh]': 'fresh()',
  },
})
export class TagChip {
  readonly tag = input.required<string>();
  /** Le compte sur le fonds, lu DANS la pastille. `null` : on ne l'affiche pas. */
  readonly count = input<number | null>(null);
  /** Le mot qu'un clic sur une image posera. */
  readonly armed = input(false, { transform: booleanAttribute });
  /** Inventé dans l'onglet, posé nulle part : il ne survivra pas au rechargement. */
  readonly fresh = input(false, { transform: booleanAttribute });
  readonly pressable = input(false, { transform: booleanAttribute });
  readonly removable = input(false, { transform: booleanAttribute });

  readonly pressed = output();
  readonly removed = output();
}
