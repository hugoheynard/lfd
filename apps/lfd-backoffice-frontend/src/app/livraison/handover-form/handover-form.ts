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

import { GesturePositionReader } from '../gesture-position';
import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { ProofPhoto } from '../proof-photo/proof-photo';
import { SignaturePad } from '../signature-pad/signature-pad';

/**
 * **« Commande déposée »** (« Remis au client » jusqu'au 2026-10-25 ; `documentation/livraisons/livreur/a-la-porte.md`, B1,
 * § 9, AP-Q2, AP-D4) — la photo de la commande déposée, toujours. Quand
 * l'arrêt exige une signature (figée au départ) : le nom de qui signe, le
 * tracé au doigt et la photo du bon signé ; sinon, ni nom ni signature — le
 * champ n'apparaît pas (Hugo, 2026-10-25).
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
  private readonly positions = inject(GesturePositionReader);

  readonly roundId = input.required<string>();
  readonly stopId = input.required<string>();
  /** La version de la tournée lue par l'écran. */
  readonly version = input.required<number>();
  /** La signature exigée au départ. */
  readonly signatureRequired = input(false);

  /** La livraison est enregistrée. */
  readonly handedOver = output();
  readonly cancelled = output();

  protected readonly nameMin = HANDOVER_RECEIVER_NAME_MIN;
  protected readonly nameMax = HANDOVER_RECEIVER_NAME_MAX;

  protected readonly receiverName = signal('');
  protected readonly photo = signal<File | null>(null);
  protected readonly signature = signal<Blob | null>(null);
  protected readonly signedSlip = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Le nom n'est demandé — et n'existe — qu'avec la signature exigée. */
  protected readonly nameValid = computed(() => {
    const length = this.receiverName().trim().length;
    return length >= this.nameMin && length <= this.nameMax;
  });
  /** Ce que la signature exigée ajoute : le nom, le tracé, la photo du bon signé. */
  protected readonly signedPiecesReady = computed(
    () => this.nameValid() && this.signature() !== null && this.signedSlip() !== null,
  );
  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.photo() !== null &&
      (!this.signatureRequired() || this.signedPiecesReady()),
  );

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
      await this.service.handOver(this.roundId(), this.stopId(), {
        position,
        version: this.version(),
        // Sans signature exigée, le champ n'existe pas : rien à envoyer.
        receiverName: this.signatureRequired() ? this.receiverName().trim() : '',
        photo,
        signature: this.signatureRequired() ? this.signature() : null,
        signedSlip: this.signatureRequired() ? this.signedSlip() : null,
      });
      this.handedOver.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La livraison n’a pas pu être enregistrée.'));
    } finally {
      this.sending.set(false);
    }
  }
}
