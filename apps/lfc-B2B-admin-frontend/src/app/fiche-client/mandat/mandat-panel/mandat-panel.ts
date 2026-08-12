import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';
import { loadStripe, type Stripe, type StripeIbanElement } from '@stripe/stripe-js';

import { NotifyService } from '../../../notify.service';
import { MandatesService } from '../mandates.service';

/** Charge d'ouverture : à qui on enregistre le mandat, et avec quelle clé Stripe. */
export interface MandatPanelData {
  readonly companyId: string;
  /** Raison sociale — rappelée à l'écran pour éviter le mandat sur le mauvais compte. */
  readonly companyName: string;
  /**
   * E-mail du détenteur, préremplissage du champ.
   *
   * Stripe **exige** une adresse sur un mandat SEPA : c'est là que part la
   * pré-notification avant chaque prélèvement, obligation réglementaire, pas
   * confort. On propose celle de la fiche, modifiable — la comptabilité n'est
   * pas toujours à la même adresse que le gérant.
   */
  readonly holderEmail: string;
  /** Clé **publique** Stripe (`pk_…`), rendue par le serveur avec la section. */
  readonly publishableKey: string;
}

/** Aujourd'hui au format `yyyy-mm-dd`, borne haute du champ date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Panneau **Enregistrer un mandat de prélèvement** (staff).
 *
 * L'IBAN est saisi dans l'**IBAN Element** de Stripe — une iframe servie par
 * Stripe. Il ne touche jamais le DOM de cette application, ne part jamais vers
 * notre backend, et le commercial ne le reverra pas : ce qui revient de
 * `createPaymentMethod`, c'est un identifiant.
 *
 * Deux champs nous appartiennent en revanche, et ils ne sont pas décoratifs :
 * le **titulaire** du compte (Stripe l'exige pour un mandat SEPA) et la **date
 * de signature** du mandat papier — celle qu'on opposera en contestation, et
 * qui est presque toujours antérieure à la saisie puisqu'on reprend un
 * portefeuille existant.
 */
@Component({
  selector: 'app-mandat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './mandat-panel.html',
  styleUrl: './mandat-panel.scss',
})
export class MandatPanel {
  /**
   * Nature du panneau : tiroir latéral au large, **bottom-sheet** sur étroit
   * (`side: 'auto'`). Un tiroir de 490 px sur un téléphone, c'est un plein
   * écran qui feint d'être un côté ; la feuille par le bas dit ce qu'elle est
   * et laisse le pouce à portée du pied de panneau.
   *
   * Déclaré ICI : le côté appartient à la nature du panneau, pas au geste qui
   * l'ouvre — six call-sites répétant `side` finissent par diverger.
   */
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly service = inject(MandatesService);
  private readonly ref = inject(FoldPanelRef);
  private readonly notify = inject(NotifyService);

  readonly data = input.required<MandatPanelData>();

  private readonly mountRef = viewChild.required<ElementRef<HTMLDivElement>>('iban');

  private stripe: Stripe | null = null;
  private iban: StripeIbanElement | null = null;

  protected readonly holderName = signal('');
  protected readonly holderEmail = signal('');
  protected readonly acceptedAt = signal(today());
  protected readonly maxDate = today();

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Sans titulaire ni adresse, Stripe refuse : autant le dire avant l'appel. */
  protected readonly canSubmit = computed(
    () =>
      this.holderName().trim() !== '' &&
      this.holderEmail().trim() !== '' &&
      !this.loading() &&
      !this.submitting(),
  );

  constructor() {
    effect(() => {
      this.holderEmail.set(this.data().holderEmail);
    });

    // Navigateur uniquement : `afterNextRender` ne tourne pas en SSR, et le nœud
    // de montage de l'iframe existe alors dans le DOM.
    afterNextRender(() => {
      void this.mount();
    });
  }

  private async mount(): Promise<void> {
    try {
      const stripe = await loadStripe(this.data().publishableKey);
      if (stripe === null) {
        this.fail('Le module bancaire est indisponible. Vérifiez la configuration Stripe.');
        return;
      }
      this.stripe = stripe;
      const iban = stripe.elements().create('iban', { supportedCountries: ['SEPA'] });
      iban.mount(this.mountRef().nativeElement);
      this.iban = iban;
      this.loading.set(false);
    } catch {
      this.fail('Impossible de charger la saisie bancaire. Réessayez.');
    }
  }

  protected async submit(): Promise<void> {
    if (this.stripe === null || this.iban === null || !this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    // L'IBAN part de l'iframe directement chez Stripe : cette méthode ne rend
    // qu'un identifiant, et c'est tout ce que nous verrons de ce compte.
    const created = await this.stripe.createPaymentMethod({
      type: 'sepa_debit',
      sepa_debit: this.iban,
      billing_details: { name: this.holderName().trim(), email: this.holderEmail().trim() },
    });
    if (created.error !== undefined || created.paymentMethod === undefined) {
      this.error.set(created.error?.message ?? "L'IBAN n'a pas été accepté.");
      this.submitting.set(false);
      return;
    }

    try {
      await this.service.register(this.data().companyId, {
        paymentMethodId: created.paymentMethod.id,
        acceptedAt: new Date(`${this.acceptedAt()}T00:00:00.000Z`).toISOString(),
      });
      this.notify.success('Mandat enregistré.');
      this.ref.close();
    } catch (error) {
      this.notify.error(error, "Le mandat n'a pas pu être enregistré.");
      this.submitting.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }

  private fail(message: string): void {
    this.error.set(message);
    this.loading.set(false);
  }
}
