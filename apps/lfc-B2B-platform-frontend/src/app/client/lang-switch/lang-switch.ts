import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ClientLocale, LOCALES, type LocaleCode } from '../client-locale.service';

/**
 * Le sélecteur de langue : trois pastilles, toujours visibles.
 *
 * Pas de liste déroulante — trois options tiennent à l'écran, et une langue
 * qu'on doit aller chercher dans un menu n'accueille personne. `fold-ng` n'a pas
 * ce contrôle segmenté : ni `fold-listbox` (déroulant) ni `fold-view-nav`
 * (navigation routée) ne le décrivent. Candidat pour fold.
 */
@Component({
  selector: 'app-lang-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-label': 'Langue', '[class]': 'size()' },
  templateUrl: './lang-switch.html',
  styleUrl: './lang-switch.scss',
})
export class LangSwitch {
  /** `sm` dans la barre du téléphone, `md` dans la colonne de bureau. */
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly locale = inject(ClientLocale);
  protected readonly locales = LOCALES;

  protected pick(code: LocaleCode): void {
    this.locale.current.set(code);
  }
}
