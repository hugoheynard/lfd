import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldChecklistComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
  type FoldChecklistItem,
  type FoldChecklistState,
  type FoldMeterTone,
} from 'fold-ng';

import { ProductFormStore } from '../product-form-store';
import { completenessOf, measure, type CompletenessCheck } from './completeness';

/** Une exigence prête à peindre : sa ligne, et le détail qu'elle replie. */
interface CheckRow {
  readonly key: string;
  /**
   * La ligne de l'exigence — un tableau d'UN élément, parce qu'elle est rendue
   * par `fold-checklist` comme ses enfants. C'est le seul moyen que le glyphe du
   * parent soit le même que celui des enfants : la table état → icône vit dans
   * la librairie et n'en sort pas, donc la redessiner ici la ferait diverger au
   * premier changement de fold-ng, en silence.
   *
   * Un tableau construit ICI et pas dans le gabarit : `[items]="[row.item]"`
   * fabriquerait une référence neuve à chaque cycle de détection.
   */
  readonly items: readonly FoldChecklistItem[];
  readonly children: readonly FoldChecklistItem[];
  readonly doneChildren: number;
}

/** Ce qu'un lecteur d'écran entend avant le libellé. La librairie livre l'anglais. */
const STATE_LABELS: Readonly<Record<FoldChecklistState, string>> = {
  done: 'Fait',
  todo: 'À faire',
  optional: 'Facultatif',
};

/**
 * Le rail collant : ce qui reste en attente, et ce qui manque.
 *
 * « Tout enregistrer » remplace l'avertissement au départ. Il n'y a plus de
 * raison de quitter la page sans avoir vu ce qui est en attente, puisque c'est
 * affiché en permanence à hauteur d'œil — un geste pour l'utilisateur, N appels
 * pour l'API, et les échecs restent indépendants (une section qui échoue reste
 * marquée « Modifié », les autres passent).
 *
 * ## Ce que la complétude dit maintenant
 *
 * **Tout est bloquant.** Il n'y a plus de lignes « facultatives » : une fiche
 * publiable est une fiche traduite dans toutes les langues du catalogue. Les
 * traductions pesaient auparavant zéro dans la barre — elles se voyaient sans
 * compter — et une fiche à 5/5, verte, pouvait partir en français seul.
 *
 * Les langues sont **repliées** derrière leur exigence, avec leur compte visible
 * (`1/3 langues`). Déplier est un geste ; savoir combien il manque n'en demande
 * aucun. Un rail qui listerait ses dix lignes à plat pour deux champs
 * traduisibles noierait le prix et le visuel au milieu des langues.
 *
 * Le modèle — quelles exigences, quelles langues, comment on compte — vit dans
 * `completeness.ts`. Ce composant ne fait que le peindre.
 */
@Component({
  selector: 'app-publish-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldChecklistComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldMeterComponent,
  ],
  templateUrl: './publish-rail.html',
  styleUrl: './publish-rail.scss',
})
export class PublishRail {
  protected readonly store = inject(ProductFormStore);

  /** Lance l'enregistrement de toutes les sections modifiées. */
  readonly saveAll = output<void>();

  protected readonly stateLabels = STATE_LABELS;

  /** Ce qui bloque la publication, tel que le modèle le dit. */
  protected readonly checks = computed<readonly CompletenessCheck[]>(() =>
    completenessOf({
      name: this.store.nameText(),
      categoryId: this.store.categoryId(),
      priceSet: this.store.priceEur() !== null,
      allergensDeclared: this.store.declaresNone() || this.store.selected().length > 0,
      description: this.store.editorial().descriptionShort ?? null,
      mediaCount: this.store.media().length,
    }),
  );

  /** Les mêmes exigences, en lignes de checklist. */
  protected readonly rows = computed<readonly CheckRow[]>(() =>
    this.checks().map((check) => ({
      key: check.key,
      items: [{ label: check.label, state: state(check.done) }],
      children: check.children.map((child) => ({
        label: child.label,
        state: state(child.done),
      })),
      doneChildren: check.children.filter((child) => child.done).length,
    })),
  );

  private readonly score = computed(() => measure(this.checks()));

  protected readonly done = computed(() => this.score().done);
  protected readonly total = computed(() => this.score().total);

  /**
   * Vert une fois tout rempli, accent avant.
   *
   * Pas d'ambre pour « incomplet » : une fiche en cours de saisie n'est pas en
   * faute, et une barre orange dès le premier champ apprend à ignorer la
   * couleur. L'alerte reste pour ce qui est vraiment anormal.
   */
  protected readonly tone = computed<FoldMeterTone>(() =>
    this.done() === this.total() ? 'success' : 'accent',
  );
}

/** Une condition satisfaite ou non — jamais `optional` : tout ici bloque. */
function state(done: boolean): FoldChecklistState {
  return done ? 'done' : 'todo';
}
