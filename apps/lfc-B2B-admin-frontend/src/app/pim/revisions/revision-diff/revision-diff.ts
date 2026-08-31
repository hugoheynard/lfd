import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type {
  AttributedFieldDiffView,
  CatalogRevisionCauseView,
  CatalogRevisionDiffView,
} from '@lfd/pim-contracts';
import { FoldCalloutComponent, FoldElementTitleComponent } from 'fold-ng';

/**
 * **Ce qui a changé entre deux révisions.**
 *
 * Trois natures, trois blocs, et elles ne se mélangent pas : ce qui est entré au
 * catalogue, ce qui en est sorti, ce qui a bougé. Une liste unique obligerait le
 * lecteur à trier lui-même, alors que les trois questions se posent séparément —
 * « qu'est-ce qu'on vend en plus » n'est pas « qu'est-ce qui a changé de prix ».
 *
 * L'en-tête vient en PREMIER. Il porte le rapport professionnel, qui bouge sans
 * qu'aucun article ne change : le mettre en bas le ferait manquer sur un diff
 * long, alors que c'est le seul changement qui touche toutes les factures d'un
 * coup.
 */
@Component({
  selector: 'app-revision-diff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldElementTitleComponent],
  templateUrl: './revision-diff.html',
  styleUrl: './revision-diff.scss',
})
export class RevisionDiff {
  readonly diff = input.required<CatalogRevisionDiffView>();

  /**
   * Qui a fait ce changement, en une phrase.
   *
   * Trois états, et le troisième dit POURQUOI il ne sait pas : « auteur non
   * défini par une action locale » veut dire qu'aucun geste sur CET article ne
   * revendique la ligne. Ce n'est ni « le système », ni un aveu d'ignorance —
   * c'est le constat qui envoie chercher la cause au-dessus, là où un réglage
   * global a pu la produire.
   *
   * « Inconnu » disait le contraire de ce qu'on veut : il laissait croire que
   * l'information manque, alors qu'elle est ailleurs et nommée.
   */
  protected author(entry: AttributedFieldDiffView | CatalogRevisionCauseView): string {
    if ('attributed' in entry && !entry.attributed) {
      // Une cause éventuelle est affichée à côté, comme une piste : ici on dit
      // qu'on ne sait pas, parce qu'on ne sait pas.
      return 'auteur non défini par une action locale';
    }
    const when = entry.at === null ? '' : ` le ${WHEN.format(new Date(entry.at))}`;
    return `${entry.by ?? 'le système'}${when}`;
  }

  /**
   * La portée d'un réglage, en une ligne — « b2b : 1 · eatIn : 1 ».
   *
   * `''` quand elle n'a pas été enregistrée : rien ne s'affiche alors, plutôt
   * qu'un « 0 » qui affirmerait que ça n'a rien touché.
   */
  protected blast(cause: CatalogRevisionCauseView): string {
    const entries = Object.entries(cause.blast);
    return entries.map(([key, count]) => `${key} : ${String(count)}`).join(' · ');
  }
}

/** La date d'un changement : le jour et l'heure, comme celle d'une ancre. */
const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
