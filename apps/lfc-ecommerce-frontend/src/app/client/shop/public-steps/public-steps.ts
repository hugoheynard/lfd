import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ClientLocale } from '../../client-locale.service';
import { stepsCopy, type StepCopy } from '../../copy/screens/steps.copy';

/** Le rang d'une étape — il n'y en a que trois, et c'est le type qui le dit. */
export type StepRank = 1 | 2 | 3;

/** Une étape telle que le rail la rend : son rang, ses mots, son état. */
interface Step extends StepCopy {
  readonly rank: StepRank;
  readonly done: boolean;
  readonly current: boolean;
}

/**
 * **Le rail des trois étapes** — où, quand, quoi.
 *
 * Extrait de l'accueil au SECOND usage : la boutique montre le même rail, avec
 * les deux premières étapes franchies. Deux copies du même balisage auraient
 * dérivé au premier ajustement, et le style pesait sur un écran déjà au bord de
 * son budget.
 *
 * ## Ce que « franchie » veut dire, et ne veut pas dire
 *
 * 🔴 Une étape franchie porte une COCHE à la place de son rang — le rang n'a
 * plus d'usage une fois la réponse donnée, et la coche dit ce que le chiffre ne
 * disait pas. Mais rien n'est franchi d'office : c'est l'écran qui déclare où
 * l'on en est, parce que lui seul sait si le visiteur a répondu ou s'il est
 * arrivé là par un lien. Sur l'accueil, la première est COURANTE et aucune
 * n'est franchie — une coche sur un choix qui n'a pas eu lieu serait un
 * mensonge.
 *
 * ## Le layout
 *
 * ⚠️ Celui de `fold-element-title` (tuile, puis titre et sous-titre en
 * colonne), mais pas le composant : sa tuile ne prend qu'un GLYPHE, et les
 * trente-et-une icônes intégrées de fold ne comptent aucun chiffre (vérifié le
 * 2026-09-17). L'employer ferait perdre le rang, qui est l'information même
 * d'une étape.
 */
@Component({
  selector: 'app-public-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-steps.html',
  styleUrl: './public-steps.scss',
})
export class PublicSteps {
  /**
   * L'étape où l'on en est. Celles qui la PRÉCÈDENT sont franchies.
   *
   * Requise, et sans défaut : un défaut ferait afficher un parcours plausible à
   * un écran qui a oublié de dire où il se trouve.
   */
  readonly current = input.required<StepRank>();

  /**
   * **Ce qui a été RÉPONDU**, dans l'ordre des étapes — « Le Labo », « Demain
   * 7 h 15 », ou `null` tant qu'on n'a pas répondu.
   *
   * 🔴 Une réponse REMPLACE la promesse. « La maison qui vous arrange » dit à
   * quoi sert l'étape ; une fois la maison choisie, cette phrase n'apprend plus
   * rien, alors que « Le Labo » rappelle ce qu'on a décidé — et c'est ce qu'on
   * vient vérifier en levant les yeux. La promesse reste pour les étapes encore
   * ouvertes, qui n'ont rien à rappeler.
   */
  readonly answers = input<readonly (string | null)[]>([]);

  /**
   * Le rail parle-t-il à un PRO ?
   *
   * 🔴 Ce ne sont pas d'autres étapes : c'est le même parcours, dans le même
   * ORDRE, dit autrement — un pro arbitre entre deux acheminements là où un
   * particulier choisit une maison. Voir `StepsCopy.pro`.
   *
   * ⚠️ Entrée et non déduction : ce composant ne connaît ni la session ni
   * l'espace, et c'est ce qui lui permet de servir aussi la boutique.
   */
  readonly pro = input(false);

  private readonly locale = inject(ClientLocale);

  protected readonly steps = computed<readonly Step[]>(() => {
    const dictionary = stepsCopy(this.locale.current());
    // Les trois étapes du registre demandé — mêmes rangs, mêmes rôles.
    const copy = this.pro() ? dictionary.pro : dictionary;
    const here = this.current();
    const answers = this.answers();
    return [
      { rank: 1 as const, ...copy.where },
      { rank: 2 as const, ...copy.when },
      { rank: 3 as const, ...copy.what },
    ].map((step, index) => ({
      ...step,
      // La réponse d'abord, la promesse à défaut — jamais les deux : deux
      // lignes sous un titre d'étape feraient un paragraphe, pas un repère.
      hint: answers[index] ?? step.hint,
      done: step.rank < here,
      current: step.rank === here,
    }));
  });

  protected readonly doneLabel = computed(() => stepsCopy(this.locale.current()).doneLabel);
}
