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
import type { BankCollectionLimitsView, LegalEntityView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldNumberInputComponent } from 'fold-ng';

import { LegalEntitiesService } from '../../../legal-entities.service';

/** Le seul schéma montré tant que D8 tient (plan `plan-plafonds-de-la-banque.md`). */
const SHOWN_SCHEME = 'B2B';
const CENTS_PER_EURO = 100;
const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/**
 * **Les plafonds de la banque** pour le schéma B2B (PL1) : unitaire, par
 * remise, mensuel. Saisis en euros, envoyés en centimes entiers.
 *
 * Un champ vide part en `null` (non renseigné), jamais en 0 : un plafond
 * qu'on n'a pas reçu de la banque n'est pas un plafond nul.
 *
 * L'ordre unitaire ≤ remise ≤ mensuel n'est qu'un AVERTISSEMENT : la banque
 * n'a pas donné cette règle (plan § 6), on enregistre quand même. Le refus
 * du serveur (montant ≤ 0) remonte à la page, qui l'affiche tel quel.
 */
@Component({
  selector: 'app-bank-limits-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldNumberInputComponent],
  templateUrl: './bank-limits-section.html',
  styleUrl: './bank-limits-section.scss',
})
export class BankLimitsSection {
  private readonly api = inject(LegalEntitiesService);

  readonly entity = input.required<LegalEntityView>();
  readonly busy = input(false);
  readonly saved = output<{ readonly action: () => Promise<unknown>; readonly said: string }>();

  protected readonly perDebit = signal<number | null>(null);
  protected readonly perRemittance = signal<number | null>(null);
  protected readonly monthly = signal<number | null>(null);

  protected readonly stored = computed(() => this.entity().bankCollectionLimits[SHOWN_SCHEME]);

  /** Ce qui est enregistré, lu en clair : « non renseigné » plutôt qu'une valeur inventée. */
  protected readonly storedSentence = computed(() => {
    const limits = this.stored();
    return (
      `Enregistré : par prélèvement ${amount(limits.perDebitCents)} · ` +
      `par remise ${amount(limits.perRemittanceCents)} · par mois ${amount(limits.monthlyCents)}.`
    );
  });

  protected readonly incoherences = computed(() => {
    const said: string[] = [];
    const debit = this.perDebit();
    const remittance = this.perRemittance();
    const month = this.monthly();
    if (debit !== null && remittance !== null && debit > remittance) {
      said.push('Le plafond par prélèvement dépasse le plafond par remise.');
    }
    if (remittance !== null && month !== null && remittance > month) {
      said.push('Le plafond par remise dépasse le plafond mensuel.');
    }
    return said;
  });

  constructor() {
    effect(() => {
      const limits = this.stored();
      this.perDebit.set(toEuros(limits.perDebitCents));
      this.perRemittance.set(toEuros(limits.perRemittanceCents));
      this.monthly.set(toEuros(limits.monthlyCents));
    });
  }

  protected save(): void {
    const id = this.entity().id;
    const payload = {
      scheme: SHOWN_SCHEME,
      perDebitCents: toCents(this.perDebit()),
      perRemittanceCents: toCents(this.perRemittance()),
      monthlyCents: toCents(this.monthly()),
    } as const;
    this.saved.emit({
      action: () => this.api.setBankCollectionLimits(id, payload),
      said: 'Plafonds de la banque enregistrés.',
    });
  }
}

function amount(cents: BankCollectionLimitsView['perDebitCents']): string {
  return cents === null ? 'non renseigné' : EUROS.format(cents / CENTS_PER_EURO);
}

function toEuros(cents: number | null): number | null {
  return cents === null ? null : cents / CENTS_PER_EURO;
}

/** `Math.round` : 12,34 × 100 vaut 1233,9999… en flottant. */
function toCents(euros: number | null): number | null {
  return euros === null ? null : Math.round(euros * CENTS_PER_EURO);
}
