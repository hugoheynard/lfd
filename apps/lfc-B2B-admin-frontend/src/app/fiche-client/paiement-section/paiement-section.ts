import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DEFERRED_TERM_LABELS, deferredTermSchema, type DeferredTerm } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

/** Une ligne de la section : un moyen de règlement, et où il en est. */
interface PaymentMeanRow {
  readonly term: DeferredTerm;
  readonly label: string;
  readonly granted: boolean;
  /** Le client l'a demandé et il n'est pas encore accordé. */
  readonly requested: boolean;
}

/**
 * Section **Moyens de paiement** d'une fiche client (staff).
 *
 * Les moyens sont **cumulatifs**. Payer à la commande n'est pas un réglage :
 * c'est le socle, offert à tout le monde, et il ne se retire pas. Ce qui
 * s'accorde, ce sont des **crédits** — régler plus tard —, et les accorder
 * n'enlève rien : un client au mensuel doit pouvoir régler une commande
 * ponctuelle à part.
 *
 * Dès qu'un crédit est accordé, il devient le **défaut** à l'encaissement :
 * c'est le régime négocié.
 */
@Component({
  selector: 'app-paiement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
  ],
  templateUrl: './paiement-section.html',
  styleUrl: './paiement-section.scss',
})
export class PaiementSection {
  /** Les crédits accordés — vide veut dire « paie à la commande », comme tout le monde. */
  readonly grantedTerms = input.required<readonly DeferredTerm[]>();
  /** Le crédit **demandé** par le client, en attente d'arbitrage ; `null` = aucun. */
  readonly requestedTerm = input<DeferredTerm | null>(null);
  /** Un mandat de prélèvement est-il enregistré ? (Pas encore possible, cf. §SEPA.) */
  readonly hasMandate = input(false);

  /** Le staff change l'ensemble complet des crédits accordés. */
  readonly grantedTermsChange = output<readonly DeferredTerm[]>();

  protected readonly rows = computed<readonly PaymentMeanRow[]>(() => {
    const granted = this.grantedTerms();
    return deferredTermSchema.options.map((term) => ({
      term,
      label: DEFERRED_TERM_LABELS[term],
      granted: granted.includes(term),
      requested: this.requestedTerm() === term && !granted.includes(term),
    }));
  });

  /** Un crédit accordé signifie « facturé puis encaissé », donc un mandat à avoir. */
  protected readonly settlesOnAccount = computed(() => this.grantedTerms().length > 0);

  /** Accorde ou retire un crédit — l'ensemble complet part au serveur. */
  protected toggle(term: DeferredTerm): void {
    const granted = this.grantedTerms();
    const next = granted.includes(term)
      ? granted.filter((candidate) => candidate !== term)
      : [...granted, term];
    this.grantedTermsChange.emit(next);
  }
}
