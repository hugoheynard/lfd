import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldIconComponent, FoldViewToggleComponent, type FoldViewToggleOption } from 'fold-ng';

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
 * Sauf quand la barre est déjà pleine : à un client reconnu elle doit aussi la
 * cloche, et trois segments plus deux boutons ne tiennent pas sur 390 px. Le
 * mode COMPACT réduit alors le sélecteur à un globe qui porte la langue en
 * cours et CYCLE au doigt. C'est le choix de la réf, et il se défend : qui est
 * reconnu a déjà choisi sa langue, il n'en change qu'exceptionnellement.
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
  imports: [FoldIconComponent, FoldViewToggleComponent],
  templateUrl: './lang-switch.html',
  styleUrl: './lang-switch.scss',
})
export class LangSwitch {
  /** `sm` dans la barre du téléphone, `md` dans la colonne de bureau. */
  readonly size = input<'sm' | 'md'>('sm');

  /** Un seul bouton au lieu des trois segments. */
  readonly compact = input(false);

  protected readonly locale = inject(ClientLocale);
  protected readonly t = inject(ClientCopyService).t;
  protected readonly options = OPTIONS;

  /** Le code affiché sur le globe. */
  protected readonly code = computed(() => this.locale.current().toUpperCase());

  /** Le nom entier, pour qui n'a que l'infobulle ou le lecteur d'écran. */
  protected readonly name = computed(
    () => LOCALES.find((l) => l.code === this.locale.current())?.name ?? '',
  );

  /** Au doigt, on passe à la suivante — et la dernière ramène à la première. */
  protected cycle(): void {
    const index = CODES.indexOf(this.locale.current());
    const next = LOCALES[(index + 1) % LOCALES.length];
    if (next) {
      this.locale.current.set(next.code);
    }
  }

  /** `valueChange` parle `string` : on ne relaie que ce qui est une de nos langues. */
  protected pick(value: string): void {
    if (isLocale(value)) {
      this.locale.current.set(value);
    }
  }
}
