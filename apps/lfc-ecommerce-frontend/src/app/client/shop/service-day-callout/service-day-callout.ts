import { ChangeDetectionStrategy, Component, inject, Injector, output } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { OrderContextStore } from '../../order-context.store';
import { ServiceDayNotice } from '../service-day-notice';

/**
 * **L'avertissement du jour de service, au panier** — le même encadré dans le
 * popover et dans le dialogue (Hugo, 2026-10-26) : un composant, pas deux
 * copies qui finiraient par dire autre chose.
 *
 * La phrase vient de {@link ServiceDayNotice} ; « Modifier » paraît quand le
 * jour retenu n'est plus possible, ou quand la boutique l'a décalé d'elle-même
 * (`offersChange`). Il rouvre le choix du jour et du créneau — l'heure seule en
 * retrait, la maison étant prise ; le dialogue du coursier en livraison, sans
 * le jour périmé, pour qu'il propose le premier possible.
 */
@Component({
  selector: 'app-service-day-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './service-day-callout.html',
})
export class ServiceDayCallout {
  protected readonly notice = inject(ServiceDayNotice);
  protected readonly c = screenCopy('commandTerms', commandTermsCopy);
  private readonly order = inject(OrderContextStore);
  private readonly injector = inject(Injector);

  /** Émis avant d'ouvrir le choix : un popover se referme, sinon il reste dessous. */
  readonly changing = output();

  protected async changeDay(): Promise<void> {
    const service = this.order.choice();
    this.changing.emit();
    // Chargées au clic : les portes tirent leurs dialogues, et le popover du
    // panier est au démarrage de la boutique (budget de 1 400 kB, 2026-10-26).
    const { OrderDoors } = await import('../order-doors');
    const doors = this.injector.get(OrderDoors);
    if (service === null) {
      await doors.choose();
    } else if (service.mode === 'delivery') {
      await doors.delivery(service.deliveryAddressId, null);
    } else if (service.pickupAddressId === null) {
      await doors.pickup(null);
    } else {
      await doors.time(service.pickupAddressId, service.place, service.address);
    }
  }
}
