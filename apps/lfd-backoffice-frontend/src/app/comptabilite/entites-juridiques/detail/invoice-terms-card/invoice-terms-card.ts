import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { LegalEntityView, SetInvoicePaymentTermsPayload } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { centsField, centsOf } from '../../../cents-field';
import {
  basisPointsOf,
  LEGAL_RATE_FORMULA,
  NO_DISCOUNT,
  percentField,
  suggestedPenaltyRate,
} from '../../../invoice-payment-terms-wording';
import { LegalEntitiesService } from '../../../legal-entities.service';

/**
 * **Les mentions de la facture** : taux des pénalités de retard, indemnité
 * forfaitaire de recouvrement, escompte pour paiement anticipé (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * ## Le taux légal est une suggestion, jamais un défaut
 *
 * Q4 (Hugo, 2026-10-08) : l'écran PROPOSE le taux BCE + 10 points ; rien
 * n'est posé tant que personne n'a enregistré. Le taux BCE varie, il n'est pas
 * écrit dans le code : la personne le lit et le tape, la carte fait l'addition.
 *
 * ## Ce qui manque vient du serveur
 *
 * `missingToInvoice` est rédigé par le domaine — la même règle que celle qui
 * refusera d'émettre. Le récrire ici en ferait une seconde définition.
 *
 * Un champ vide = « à renseigner » : il part `null`, et n'efface rien d'autre.
 */
@Component({
  selector: 'app-invoice-terms-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldInputComponent,
    FoldBadgeComponent,
  ],
  templateUrl: './invoice-terms-card.html',
  styleUrl: './invoice-terms-card.scss',
})
export class InvoiceTermsCard {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);

  /** Ce que le geste a fait, pour que la page relise et annonce. */
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly formula = LEGAL_RATE_FORMULA;
  protected readonly noDiscount = NO_DISCOUNT;

  protected readonly ecbDraft = signal('');
  protected readonly rateDraft = signal('');
  protected readonly indemnityDraft = signal('');
  protected readonly discountDraft = signal('');

  /** La suggestion, dès que le taux BCE est lisible. */
  protected readonly suggestion = computed(() => {
    const raw = this.ecbDraft().trim();
    return raw === '' ? null : suggestedPenaltyRate(basisPointsOf(raw));
  });

  protected readonly rate = computed(() => optionalOf(this.rateDraft(), basisPointsOf));
  protected readonly indemnity = computed(() => optionalOf(this.indemnityDraft(), centsOf));

  /** Un champ rempli mais illisible bloque l'enregistrement ; un champ vide, non. */
  protected readonly unreadable = computed(
    () => this.rate() === UNREADABLE || this.indemnity() === UNREADABLE,
  );

  protected readonly percent = percentField;

  constructor() {
    effect(() => {
      const terms = this.entity().invoicePaymentTerms;
      this.rateDraft.set(
        terms.latePenaltyRateBasisPoints === null
          ? ''
          : percentField(terms.latePenaltyRateBasisPoints),
      );
      this.indemnityDraft.set(
        terms.recoveryIndemnityCents === null ? '' : centsField(terms.recoveryIndemnityCents),
      );
      this.discountDraft.set(terms.earlyPaymentDiscount ?? '');
    });
  }

  protected takeSuggestion(): void {
    const suggested = this.suggestion();
    if (suggested !== null) {
      this.rateDraft.set(percentField(suggested));
    }
  }

  protected save(): void {
    const rate = this.rate();
    const indemnity = this.indemnity();
    if (rate === UNREADABLE || indemnity === UNREADABLE) {
      return;
    }
    const discount = this.discountDraft().trim();
    const payload: SetInvoicePaymentTermsPayload = {
      latePenaltyRateBasisPoints: rate,
      recoveryIndemnityCents: indemnity,
      earlyPaymentDiscount: discount === '' ? null : discount,
    };
    const id = this.entity().id;
    this.saved.emit({
      action: () => this.api.setInvoicePaymentTerms(id, payload),
      said: 'Mentions de la facture enregistrées.',
    });
  }
}

const UNREADABLE = 'unreadable';

/** Vide → `null` (« à renseigner ») ; illisible → `UNREADABLE`. */
function optionalOf(
  raw: string,
  parse: (raw: string) => number | null,
): number | null | typeof UNREADABLE {
  if (raw.trim() === '') {
    return null;
  }
  return parse(raw) ?? UNREADABLE;
}
