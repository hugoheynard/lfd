import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

import { ClientLocale, LOCALES, type LocaleCode } from '../client-locale.service';
import { ClientCopyService } from '../copy/client-copy.service';

/** Les trois langues en segments — le libellé court, la valeur canonique. */
const OPTIONS: readonly FoldViewToggleOption[] = LOCALES.map((l) => ({
  value: l.code,
  label: l.code.toUpperCase(),
}));

const CODES: readonly string[] = LOCALES.map((l) => l.code);

/** Garde de type : évite un `as` là où une vérification suffit à convaincre TS. */
function isLocale(value: string): value is LocaleCode {
  return CODES.includes(value);
}

/**
 * Le sélecteur de langue : trois segments, toujours visibles.
 *
 * Pas de liste déroulante — trois options tiennent à l'écran, et une langue
 * qu'on doit aller chercher dans un menu n'accueille personne. Val d'Isère est
 * frontalière : c'est une question d'accueil, pas un réglage.
 *
 * Le contrôle est `fold-view-toggle`, qui EST ce segmented single-select —
 * `role="radiogroup"`, tabindex mobile, flèches et Début/Fin compris. Ce
 * composant-ci n'ajoute que le métier : la liste des langues et le service qui
 * retient le choix. Sur l'encre, `activeStyle="solid"` peint le segment choisi
 * en `primary`, que le sous-bloc `chrome` a fait passer au papier — d'où la
 * pastille crème de la réf, sans une ligne de CSS.
 */
@Component({
  selector: 'app-lang-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewToggleComponent],
  templateUrl: './lang-switch.html',
  styleUrl: './lang-switch.scss',
})
export class LangSwitch {
  /** `sm` dans la barre du téléphone, `md` dans la colonne de bureau. */
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly locale = inject(ClientLocale);
  protected readonly t = inject(ClientCopyService).t;
  protected readonly options = OPTIONS;

  /** `valueChange` parle `string` : on ne relaie que ce qui est une de nos langues. */
  protected pick(value: string): void {
    if (isLocale(value)) {
      this.locale.current.set(value);
    }
  }
}
