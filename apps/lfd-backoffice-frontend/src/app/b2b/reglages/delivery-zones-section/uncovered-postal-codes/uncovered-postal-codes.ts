import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { UncoveredPostalCodeView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { DeliveryZonesService } from '../../delivery-zones.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Les codes postaux de livraison qu'aucune zone ne couvre** — au-dessus de la
 * liste des zones (Hugo, 2026-10-20). Hors zone, une commande livrée est
 * refusée : ces clients ne peuvent pas être livrés tant qu'un tarif n'est pas
 * posé. Rien quand tout est couvert ; un échec de lecture reste discret, la
 * liste des zones ne dépend pas de lui.
 *
 * Il se relit à chaque montage : la section le recrée en rechargeant ses zones
 * après un enregistrement, et un code qu'on vient de couvrir le quitte.
 */
@Component({
  selector: 'app-uncovered-postal-codes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent, RouterLink],
  templateUrl: './uncovered-postal-codes.html',
  styleUrl: './uncovered-postal-codes.scss',
})
export class UncoveredPostalCodes {
  private readonly zones = inject(DeliveryZonesService);

  /** Ajouter un tarif écrit une zone : sans le droit, on avertit sans proposer. */
  readonly canWrite = input(false);
  /** « Ajouter un tarif » pour ce code postal. */
  readonly addZone = output<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly codes = signal<readonly UncoveredPostalCodeView[]>([]);

  protected readonly headline = computed(() => {
    const count = this.codes().length;
    return count === 1
      ? "1 code postal d'adresse de livraison n'est couvert par aucune zone : ces clients ne peuvent pas être livrés."
      : `${count} codes postaux d'adresses de livraison ne sont couverts par aucune zone : ces clients ne peuvent pas être livrés.`;
  });

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.codes.set(await this.zones.uncoveredPostalCodes());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Les comptes que la ligne ne nomme pas. */
  protected others(code: UncoveredPostalCodeView): number {
    return code.companyCount - code.companies.length;
  }
}
