import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  CustomerAudience,
  DeliveryAvailabilityPatch,
  DeliveryAvailabilityView,
} from '@lfd/contracts';
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

import { DeliveryAvailabilityService } from '../delivery-availability.service';
import { DeliveryZonesSection } from '../delivery-zones-section/delivery-zones-section';

type LoadState = 'loading' | 'ready' | 'error';

/** Les deux cases, telles qu'on les coche avant d'enregistrer. */
interface Availability {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
}

/** Ce qu'une case décochée retire, dit du point de vue de la clientèle. */
const CLOSED_SENTENCE: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'Les pros ne peuvent plus choisir la livraison.',
  b2c: 'Les particuliers ne peuvent plus choisir la livraison.',
};

/** Qui perd la livraison, dans l'avertissement d'avant enregistrement. */
const CLIENTELE: Readonly<Record<CustomerAudience, string>> = {
  b2b: 'aux pros',
  b2c: 'aux particuliers',
};

/**
 * **Livraison** — « E-commerce LFC → Réglages ». À qui la livraison est
 * proposée, puis ce qu'elle coûte selon le code postal : deux encarts.
 *
 * 🔴 **Les cases s'enregistraient au clic** jusqu'au 2026-09-15. Un clic de
 * travers retirait un service à toute une clientèle, sans rien pour l'arrêter
 * (Hugo). Les cases posent désormais un BROUILLON ; seul « Enregistrer » écrit,
 * et fermer une clientèle qui avait la livraison s'annonce AVANT, dans un
 * avertissement qui dit ce que le geste retire.
 *
 * Le serveur lit le réglage au devis comme à la commande, et refuse une
 * livraison fermée (409). L'écran ne décide rien : il pose le réglage.
 * Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4 et D6.
 */
@Component({
  selector: 'app-delivery-availability-page',
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
  templateUrl: './delivery-availability-page.html',
  styleUrl: './delivery-availability-page.scss',
})
export class DeliveryAvailabilityPage {
  private readonly service = inject(DeliveryAvailabilityService);

  protected readonly state = signal<LoadState>('loading');
  /** Le réglage tel que le serveur le tient. */
  protected readonly settings = signal<DeliveryAvailabilityView | null>(null);
  /** Les cases telles qu'elles sont cochées, enregistrées ou non. */
  protected readonly draft = signal<Availability | null>(null);
  protected readonly saving = signal(false);
  /** Le dernier refus, en clair ; `null` quand le dernier envoi a abouti. */
  protected readonly failure = signal<string | null>(null);

  /** Quelque chose à enregistrer : le brouillon diffère du réglage servi. */
  protected readonly dirty = computed(() => this.patch() !== null);

  /**
   * Les clientèles qui PERDRAIENT la livraison à l'enregistrement : ouvertes
   * sur le serveur, décochées dans le brouillon. Une case qu'on coche n'avertit
   * de rien — elle n'enlève rien à personne.
   */
  protected readonly closing = computed<readonly CustomerAudience[]>(() => {
    const saved = this.settings();
    const draft = this.draft();
    if (saved === null || draft === null) {
      return [];
    }
    const lost: CustomerAudience[] = [];
    if (saved.openToB2b && !draft.openToB2b) {
      lost.push('b2b');
    }
    if (saved.openToB2c && !draft.openToB2c) {
      lost.push('b2c');
    }
    return lost;
  });

  /** « aux pros », « aux particuliers », « aux pros et aux particuliers ». */
  protected readonly closingLabel = computed(() =>
    this.closing()
      .map((audience) => CLIENTELE[audience])
      .join(' et '),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.receive(await this.service.read());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** La phrase sous une case décochée ; rien sous une case cochée. */
  protected closedSentence(audience: CustomerAudience, open: boolean): string {
    return open ? '' : CLOSED_SENTENCE[audience];
  }

  /** Coche ou décoche, sans rien écrire. */
  protected set(audience: CustomerAudience, open: boolean): void {
    const draft = this.draft();
    if (draft === null) {
      return;
    }
    this.draft.set(
      audience === 'b2b' ? { ...draft, openToB2b: open } : { ...draft, openToB2c: open },
    );
  }

  /** Revient au réglage servi. */
  protected reset(): void {
    const saved = this.settings();
    if (saved !== null) {
      this.draft.set(availabilityOf(saved));
    }
    this.failure.set(null);
  }

  /**
   * Envoie ce qui a changé, et seulement ça, puis relit. Un refus laisse le
   * brouillon en place : ce qui a été coché reste à l'écran, avec la raison.
   */
  protected async save(): Promise<void> {
    const patch = this.patch();
    if (patch === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.failure.set(null);
    try {
      await this.service.update(patch);
      this.receive(await this.service.read());
    } catch (error) {
      this.failure.set(
        httpErrorMessage(error, "Le réglage de livraison n'a pas pu être enregistré."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Le patch du brouillon : les cases qui diffèrent du serveur, ou `null`. */
  private patch(): DeliveryAvailabilityPatch | null {
    const saved = this.settings();
    const draft = this.draft();
    if (saved === null || draft === null) {
      return null;
    }
    const patch: { openToB2b?: boolean; openToB2c?: boolean } = {};
    if (draft.openToB2b !== saved.openToB2b) {
      patch.openToB2b = draft.openToB2b;
    }
    if (draft.openToB2c !== saved.openToB2c) {
      patch.openToB2c = draft.openToB2c;
    }
    return Object.keys(patch).length === 0 ? null : patch;
  }

  private receive(view: DeliveryAvailabilityView): void {
    this.settings.set(view);
    this.draft.set(availabilityOf(view));
  }
}

function availabilityOf(view: DeliveryAvailabilityView): Availability {
  return { openToB2b: view.openToB2b, openToB2c: view.openToB2c };
}
