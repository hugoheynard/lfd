import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { GesturePositionReader } from '../gesture-position';
import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { ProofPhoto } from '../proof-photo/proof-photo';

/**
 * **« Déposé avec preuve »** (`documentation/livraisons/a-la-porte.md`,
 * B2, § 9, AP-Q6) — personne pour réceptionner : la photo, et elle seule.
 *
 * La carte ne l'ouvre que si l'arrêt le permet (`canDeposit`), mais c'est le
 * serveur qui tranche : son refus s'affiche tel quel, le formulaire reste ouvert.
 */
@Component({
  selector: 'app-deposit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, ProofPhoto],
  templateUrl: './deposit-form.html',
  styleUrl: './deposit-form.scss',
})
export class DepositForm {
  private readonly service = inject(MyDeliveryRoundService);
  private readonly positions = inject(GesturePositionReader);

  readonly roundId = input.required<string>();
  readonly stopId = input.required<string>();
  /** La version de la tournée lue par l'écran. */
  readonly version = input.required<number>();

  /** Le dépôt est enregistré. */
  readonly deposited = output();
  readonly cancelled = output();

  protected readonly photo = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly canSend = computed(() => !this.sending() && this.photo() !== null);

  protected async send(): Promise<void> {
    const photo = this.photo();
    if (!this.canSend() || photo === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    try {
      // Au geste seulement (YA-D4) ; indisponible, le geste part sans elle.
      const position = await this.positions.read();
      await this.service.deposit(this.roundId(), this.stopId(), {
        position,
        version: this.version(),
        photo,
      });
      this.deposited.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le dépôt n’a pas pu être enregistré.'));
    } finally {
      this.sending.set(false);
    }
  }
}
