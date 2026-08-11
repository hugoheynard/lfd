import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  output,
  signal,
} from '@angular/core';
import { FoldInputComponent } from 'fold-ng';

/** Qui détiendra le compte : une adresse, et ce qu'on sait d'autre. */
export interface HolderChoice {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
}

/**
 * Le **détenteur** d'un compte : son adresse, et rien qu'elle.
 *
 * Pas de recherche, et c'est une décision de **confidentialité**. Chercher une
 * personne par son nom rendrait, pour chacune, les sociétés qu'elle détient —
 * donc « ce comptable travaille déjà chez un autre de nos clients ». Dans un
 * milieu où tout le monde se connaît, cette phrase n'appartient ni au
 * commercial ni au détenteur qu'on est en train de servir.
 *
 * La déduplication n'en a jamais eu besoin : la clé est l'**adresse**, et c'est
 * le serveur qui la résout — il rattache la société à un espace existant ou en
 * ouvre un, sans que rien ne le distingue à l'écran. Accessoirement, c'est ce
 * qui passe à l'échelle : un accès par index plutôt qu'un balayage de toute la
 * table des personnes à chaque frappe.
 *
 * Seule l'adresse est exigée : c'est par elle que le détenteur recevra son mot
 * de passe. Le reste est du confort, et l'exiger bloquerait une saisie faite au
 * comptoir.
 */
@Component({
  selector: 'app-holder-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldInputComponent],
  templateUrl: './holder-picker.html',
  styleUrl: './holder-picker.scss',
})
export class HolderPicker {
  /** Le détenteur retenu, `null` tant qu'aucune adresse n'est saisie. */
  readonly holderChange = output<HolderChoice | null>();

  protected readonly email = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly phone = signal('');

  private readonly choice = computed<HolderChoice | null>(() => {
    const email = this.email().trim();
    if (email === '') {
      return null;
    }
    return {
      email,
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      phone: this.phone().trim(),
    };
  });

  constructor() {
    effect(() => {
      this.holderChange.emit(this.choice());
    });
  }
}
