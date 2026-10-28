import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import {
  FoldAvatarComponent,
  FoldAvatarDetailComponent,
  FoldButtonComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

/**
 * **La bulle de la personne connectée**, dans l'en-tête (Hugo, 2026-10-28) :
 * ses initiales, qui ouvrent un menu avec son nom, son adresse, son rôle et la
 * déconnexion. Elle remplace l'adresse écrite en clair dans l'en-tête. Le pied
 * du menu mobile garde sa propre déconnexion.
 */
@Component({
  selector: 'app-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldAvatarComponent,
    FoldAvatarDetailComponent,
    FoldButtonComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
})
export class UserMenu {
  /** Le nom de la personne, ou à défaut son adresse : les initiales en viennent. */
  readonly name = input.required<string>();
  readonly email = input<string | null>(null);
  /** Le rôle sous lequel elle est entrée ; vide s'il n'est pas encore lu. */
  readonly roleLabel = input('');

  readonly loggedOut = output();

  protected readonly open = model(false);

  protected logout(): void {
    this.open.set(false);
    this.loggedOut.emit();
  }
}
