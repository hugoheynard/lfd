import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ShopLevel } from '@lfd/contracts';
import { FoldButtonComponent, FoldCardComponent, FoldInputComponent } from 'fold-ng';

import type { ProRegistration } from '../../../auth/auth.facade';
import { ClientLocale } from '../../../client/client-locale.service';
import { CallbackBlock } from '../../../client/callback-block/callback-block';
import { ClientCopyService } from '../../../client/copy/client-copy.service';
import { proAccountCopy } from '../../../client/copy/screens/pro-account.copy';
import { ShopPromise } from '../../../client/shop-promise/shop-promise';

/**
 * **La porte PRO** — quatre informations et le nom de l'établissement.
 *
 * 🔴 Il n'y a AUCUN fournisseur social ici, et ce n'est pas un oubli : un
 * compte pro s'ouvre au nom d'un établissement, et une adresse Google
 * personnelle rattacherait le dossier de l'établissement au compte privé de
 * qui l'a ouvert — c'est-à-dire à quelqu'un qui peut partir.
 *
 * ⚠️ **Ces informations suffisent à COMMANDER** (handoff `handoff-inscription`,
 * §2). La validation par le fournil se fait en parallèle et ne bloque pas la
 * première commande : c'est ce que dit la promesse, et c'est ce que l'écran de
 * retour répète en ambre plutôt qu'en rouge.
 *
 * Le composant COLLECTE ; il ne déclare rien. Ce qui est tapé part dans
 * l'`appState` d'Auth0 et revient se poser sur le compte — la déclaration
 * d'établissement est déposée au RETOUR, par `ProOnboarding`, parce qu'on ne
 * dépose pas un dossier pour un compte qui n'existe pas encore (§5).
 */
@Component({
  selector: 'app-pro-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CallbackBlock, FoldButtonComponent, FoldCardComponent, FoldInputComponent, ShopPromise],
  templateUrl: './pro-step.html',
  styleUrl: './pro-step.scss',
})
export class ProStep {
  /**
   * Le niveau de la boutique, pour la promesse « ouvre bientôt ».
   *
   * `null` tant que la lecture est en vol : l'écran ne promet rien et ne
   * clignote pas quand la boutique est ouverte.
   */
  readonly shopLevel = input<ShopLevel | null>(null);

  /**
   * Le numéro sur lequel le fournil rappellera — celui du COMPTE, s'il y en a
   * un. Vide : le lien d'appel disparaît.
   *
   * ⚠️ Nommé ainsi et non `phone` : le formulaire a déjà un champ `phone`, qui
   * est celui qu'on est en train de TAPER. Les deux ne sont pas le même
   * numéro, et le compilateur l'a dit avant moi.
   */
  readonly callbackPhone = input('');

  /** Le créneau de rappel déjà obtenu, s'il y en a un. */
  readonly bookedSlot = input<string | null>(null);

  /** Les cinq champs. Le composant les COLLECTE ; il ne les envoie nulle part. */
  readonly signedUp = output<ProRegistration>();

  /** L'e-mail déjà tapé, s'il y en a un : il préremplira l'écran d'Auth0. */
  readonly wantsLogin = output<string>();

  /** L'autre porte, proposée en toutes lettres au pied du formulaire (§1). */
  readonly wantsPerso = output<void>();

  /** Le rappel commercial — une porte de sortie humaine, jamais une étape (§4). */
  readonly wantsCallback = output<void>();
  readonly cancelledCallback = output<void>();

  private readonly locale = inject(ClientLocale);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly copy = computed(() => proAccountCopy(this.locale.current()));

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly enseigne = signal('');

  protected readonly complete = computed(() =>
    [this.firstName(), this.lastName(), this.email(), this.phone(), this.enseigne()].every(
      (value) => value.trim() !== '',
    ),
  );

  protected submit(): void {
    if (!this.complete()) {
      return;
    }
    this.signedUp.emit({
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      enseigne: this.enseigne().trim(),
    });
  }
}
