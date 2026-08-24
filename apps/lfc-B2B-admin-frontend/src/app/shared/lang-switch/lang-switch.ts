import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

/** Les langues du catalogue. `fr` est la seule obligatoire — cf. `LocalizedText`. */
export type Lang = 'fr' | 'en' | 'it';

/** L'ordre de lecture, et les libellés. Une table, pas un `switch` : ajouter une
 *  langue se fait ici et nulle part ailleurs. */
const LABELS: Readonly<Record<Lang, string>> = {
  fr: 'FR',
  en: 'EN',
  it: 'IT',
};

/**
 * Sélecteur de langue d'une **section**, jamais d'une page.
 *
 * C'est la règle qui justifie le composant : une fiche mélange du traduisible
 * (nom, description, texte alternatif) et du non-traduisible (référence, TVA,
 * poids, conditionnements). Un sélecteur au niveau de la page ferait basculer
 * les seconds avec les premiers — ou, pire, laisserait croire qu'ils basculent.
 * Chaque section localisée porte donc le sien, et ne parle que pour elle.
 *
 * Il rend visible ce qui manque à DEUX endroits, et les deux sont nécessaires :
 * un **point ambre** sur la langue incomplète, qui dit « regarde ici » sans dire
 * quoi, et une **ligne en clair** qui dit quoi. Le point seul laisserait chercher
 * ; la ligne seule obligerait à lire trois langues pour savoir laquelle pèche.
 *
 * Il ne connaît AUCUN domaine : on lui donne les langues, celles qui sont
 * incomplètes, et la phrase qui l'explique. C'est l'appelant qui sait ce que
 * « complet » veut dire pour ses champs.
 *
 * ```html
 * <app-lang-switch
 *   [(lang)]="lang"
 *   [missing]="['it']"
 *   hint="IT : le nom et la description manquent."
 * />
 * ```
 */
@Component({
  selector: 'app-lang-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewToggleComponent],
  templateUrl: './lang-switch.html',
  styleUrl: './lang-switch.scss',
})
export class LangSwitch {
  /** La langue affichée. Bidirectionnelle : la section la lit pour choisir quoi rendre. */
  readonly lang = model<Lang>('fr');

  /** Les langues proposées, dans l'ordre. */
  readonly langs = input<readonly Lang[]>(['fr', 'en', 'it']);

  /**
   * Celles dont la traduction est incomplète — elles portent le point ambre.
   * « Incomplet » n'a pas de sens général : c'est l'appelant qui le définit pour
   * ses propres champs, et qui l'explique dans {@link hint}.
   */
  readonly missing = input<readonly Lang[]>([]);

  /** Ce qui manque, en toutes lettres. Sans elle, le point n'est qu'une alarme. */
  readonly hint = input<string>();

  /** Nom du groupe de boutons pour les technologies d'assistance. */
  readonly ariaLabel = input('Langue de la section');

  protected readonly options = computed<FoldViewToggleOption[]>(() =>
    this.langs().map((lang) => {
      const incomplete = this.missing().includes(lang);
      return {
        value: lang,
        label: LABELS[lang],
        ...(incomplete ? { dot: 'warning' as const, dotLabel: 'traduction incomplète' } : {}),
      };
    }),
  );

  /** `value` de fold est un `string` ; le rétrécir ici garde le typage au bord. */
  protected onValue(value: string): void {
    this.lang.set(value as Lang);
  }
}
