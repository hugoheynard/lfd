import { inject, signal, type WritableSignal } from '@angular/core';
import type { MyDeliveryRoundView, MyDeliveryStopView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { DriverNoticeGate } from './driver-notice-gate';
import { GesturePositionReader } from './gesture-position';
import { MyDeliveryRoundService } from './my-delivery-round.service';
import type { MyRoundReader } from './my-round-reader';

/**
 * Les gestes du livreur sur « Ma tournée » : partir, arriver, clore sans
 * remise, rentrer. Chacun part avec la version lue, affiche le refus du
 * serveur tel quel (MT-D3 v2) et relit la tournée dans tous les cas.
 *
 * Sorti de `MyRoundPage` pour que la page ne garde que ce qu'elle montre ;
 * construit dans son contexte d'injection (initialiseur de champ), ce qui
 * l'autorise à appeler `inject()`. Le refus est celui de la page, partagé
 * avec la lecture qui l'efface en changeant de tournée.
 */
export class MyRoundGestures {
  private readonly service = inject(MyDeliveryRoundService);
  private readonly notice = inject(DriverNoticeGate);
  private readonly positions = inject(GesturePositionReader);

  readonly busy = signal(false);

  constructor(
    private readonly reader: MyRoundReader,
    private readonly refusal: WritableSignal<string | null>,
  ) {}

  /** « Commencer ma tournée » — avec la version lue ; relue après, refusée ou non. */
  async depart(): Promise<void> {
    const round = this.reader.round();
    if (round === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    if (!(await this.noticeCleared())) {
      this.busy.set(false);
      return;
    }
    try {
      await this.service.depart(round.id, { version: round.version });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La tournée n’a pas pu commencer.'));
    }
    // Relire dans les deux cas : partie, elle montre ses liens ; refusée, sa
    // version a peut-être changé au dépôt.
    await this.reader.loadRound(round.id);
    this.busy.set(false);
  }

  /**
   * Le texte d'information est-il lu ? Sinon le dialogue s'ouvre ; « Plus
   * tard » rend `false` et la tournée ne démarre pas. Une lecture impossible
   * se dit, et ne démarre pas non plus : partir sans l'information serait
   * le défaut silencieux.
   */
  private async noticeCleared(): Promise<boolean> {
    try {
      return await this.notice.clear();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, '« Vos données de livreur » n’a pas pu être lu. Réessayez.'),
      );
      return false;
    }
  }

  /** « Je suis arrivé » sur l'arrêt suivant. */
  arrive(stop: MyDeliveryStopView): Promise<void> {
    return this.gesture(
      async (round) => this.service.arrive(round.id, stop.stopId, await this.positions.read()),
      'L’arrivée n’a pas pu être enregistrée.',
    );
  }

  /** Clore sans remise, avec la version lue : une tournée changée entre-temps est refusée. */
  closeWithoutHandover(stop: MyDeliveryStopView): Promise<void> {
    return this.gesture(
      async (round) =>
        this.service.closeWithoutHandover(round.id, stop.stopId, {
          version: round.version,
          ...(await this.positions.read()),
        }),
      'L’arrêt n’a pas pu être clos.',
    );
  }

  /** « Tournée terminée » (PL2) — confirmée dans la page, jamais par `confirm()`. */
  returnToDepot(): Promise<void> {
    return this.gesture(
      (round) => this.service.returnToDepot(round.id),
      'La tournée n’a pas pu être déclarée rentrée.',
    );
  }

  /**
   * Un geste à la porte : refusé, le message du serveur s'affiche tel quel ;
   * dans les deux cas la tournée est relue.
   */
  private async gesture(
    write: (round: MyDeliveryRoundView) => Promise<void>,
    fallback: string,
  ): Promise<void> {
    const round = this.reader.round();
    if (round === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await write(round);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, fallback));
    }
    await this.reader.loadRound(round.id);
    this.busy.set(false);
  }
}
