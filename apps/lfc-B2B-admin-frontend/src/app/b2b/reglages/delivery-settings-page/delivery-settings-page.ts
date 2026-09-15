import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { CustomerAudience, DeliverySettingsPatch, DeliverySettingsView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldFieldsetComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { DeliverySettingsService } from '../delivery-settings.service';
import { DeliveryZonesSection } from '../delivery-zones-section/delivery-zones-section';

type LoadState = 'loading' | 'ready' | 'error';

/** Ce qu'une case décochée retire, dit du point de vue de la clientèle. */
const CLOSED_SENTENCE: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Les pros ne peuvent plus choisir la livraison.',
  b2c: 'Les particuliers ne peuvent plus choisir la livraison.',
};

/**
 * **Livraison** — « E-commerce LFC → Réglages ». À qui la livraison est
 * proposée, puis ce qu'elle coûte selon le code postal.
 *
 * Les deux cases s'enregistrent **au geste** : il n'y a rien d'autre à saisir
 * avec elles, et un bouton « Enregistrer » pour une case ferait croire qu'elle
 * est posée alors qu'elle ne l'est pas. En cas de refus, la case revient à ce
 * que le serveur tient, et le refus reste affiché au-dessus des zones.
 *
 * Le réglage est lu par le serveur au devis comme à la commande, qui refuse
 * une livraison fermée (409). L'écran ne décide rien : il pose le réglage.
 * Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4 et D6.
 */
@Component({
  selector: 'app-delivery-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeliveryZonesSection,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldFieldsetComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './delivery-settings-page.html',
  styleUrl: './delivery-settings-page.scss',
})
export class DeliverySettingsPage {
  private readonly service = inject(DeliverySettingsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly settings = signal<DeliverySettingsView | null>(null);
  /** Un geste part : les deux cases attendent, pour qu'un second ne croise pas le premier. */
  protected readonly saving = signal(false);
  /** Le dernier refus, en clair ; `null` quand le dernier geste a abouti. */
  protected readonly failure = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.settings.set(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** La phrase sous une case décochée ; rien sous une case cochée. */
  protected closedSentence(audience: CustomerAudience, open: boolean): string {
    return open ? '' : CLOSED_SENTENCE[audience];
  }

  /**
   * Enregistre une case. La case bouge tout de suite, et revient à l'état
   * d'avant si le serveur refuse : la laisser cochée affirmerait un réglage
   * qui n'existe pas.
   */
  protected async toggle(audience: CustomerAudience, open: boolean): Promise<void> {
    const previous = this.settings();
    if (previous === null || this.saving()) {
      return;
    }
    const patch: DeliverySettingsPatch =
      audience === 'b2b' ? { openToB2b: open } : { openToB2c: open };
    this.settings.set(
      audience === 'b2b' ? { ...previous, openToB2b: open } : { ...previous, openToB2c: open },
    );
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.service.update(patch);
    } catch (error) {
      this.settings.set(previous);
      this.failure.set(
        httpErrorMessage(error, "Le réglage de livraison n'a pas pu être enregistré."),
      );
      this.saving.set(false);
      return;
    }
    await this.refresh();
    this.saving.set(false);
  }

  /**
   * Relit le réglage après une écriture acceptée. Un échec de relecture garde la
   * case telle que cochée : le serveur a accepté, elle dit donc vrai.
   */
  private async refresh(): Promise<void> {
    try {
      this.settings.set(await this.service.read());
    } catch {
      // La valeur posée au geste est celle que le serveur vient d'accepter.
    }
  }
}
