import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HANDOVER_RECEIVER_NAME_MAX, HANDOVER_RECEIVER_NAME_MIN } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInputComponent } from 'fold-ng';

import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { ProofPhoto } from '../proof-photo/proof-photo';
import { SignaturePad } from '../signature-pad/signature-pad';

/**
 * **« Remis au client »** (`documentation/livraisons/a-la-porte.md`, B1,
 * § 9, AP-Q2, AP-D4) — la photo, toujours ; le nom de qui réceptionne,
 * toujours ; la signature au doigt quand l'arrêt l'exige (figée au départ).
 *
 * L'écran n'envoie pas sans les pièces exigées, mais c'est le serveur qui
 * tranche : son refus s'affiche tel quel, et le formulaire reste ouvert.
 */
@Component({
  selector: 'app-handover-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    ProofPhoto,
    SignaturePad,
  ],
  templateUrl: './handover-form.html',
  styleUrl: './handover-form.scss',
})
export class HandoverForm {
  private readonly service = inject(MyDeliveryRoundService);

  readonly roundId = input.required<string>();
  readonly stopId = input.required<string>();
  /** La version de la tournée lue par l'écran. */
  readonly version = input.required<number>();
  /** La signature exigée au départ. */
  readonly signatureRequired = input(false);

  /** La remise est enregistrée. */
  readonly handedOver = output();
  readonly cancelled = output();

  protected readonly nameMin = HANDOVER_RECEIVER_NAME_MIN;
  protected readonly nameMax = HANDOVER_RECEIVER_NAME_MAX;

  protected readonly receiverName = signal('');
  protected readonly photo = signal<File | null>(null);
  protected readonly signature = signal<Blob | null>(null);
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly nameValid = computed(() => {
    const length = this.receiverName().trim().length;
    return length >= this.nameMin && length <= this.nameMax;
  });
  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.photo() !== null &&
      this.nameValid() &&
      (!this.signatureRequired() || this.signature() !== null),
  );

  protected async send(): Promise<void> {
    const photo = this.photo();
    if (!this.canSend() || photo === null) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    try {
      await this.service.handOver(this.roundId(), this.stopId(), {
        version: this.version(),
        receiverName: this.receiverName().trim(),
        photo,
        signature: this.signature(),
      });
      this.handedOver.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La remise n’a pas pu être enregistrée.'));
    } finally {
      this.sending.set(false);
    }
  }
}
