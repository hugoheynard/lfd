import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { PAYMENT_TERM_LABELS, type PaymentTerm } from '../../comptes-clients/admin-company';

/**
 * Comment on encaisse, **déduit du terme** tant qu'aucun instrument n'est
 * enregistré.
 *
 * C'est aujourd'hui une déduction et non une donnée : `per_order` veut dire à la
 * fois « dû à la commande » et « payé par carte ». Cette confusion est
 * documentée (`architecture-prelevement-sepa.md` §1.A) et sera levée par un
 * `PaymentInstrument` propre ; en attendant, l'écran dit ce qui se passe
 * réellement plutôt que d'inventer un champ.
 */
const COLLECTION: Readonly<Record<PaymentTerm, string>> = {
  per_order: 'Carte bancaire, au moment de la commande',
  monthly: 'Facturé au terme — encaissement hors plateforme',
  net60: 'Facturé au terme — encaissement hors plateforme',
  net90: 'Facturé au terme — encaissement hors plateforme',
};

/**
 * Section **Moyens de paiement** d'une fiche client (staff).
 *
 * Elle répond à deux questions que le commercial se pose avant de promettre
 * quoi que ce soit : **quand** ce client paie, et **comment** on est encaissé.
 *
 * Le prélèvement SEPA y est annoncé comme **indisponible**, et c'est délibéré :
 * la fiche est l'endroit où un commercial vérifie avant de s'engager devant son
 * client. Taire une capacité absente laisserait promettre un prélèvement qui
 * n'existe pas ; l'afficher « à venir » sans rien derrière reviendrait au même.
 */
@Component({
  selector: 'app-paiement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldFieldListComponent,
    FoldFieldComponent,
    FoldButtonComponent,
  ],
  templateUrl: './paiement-section.html',
  styleUrl: './paiement-section.scss',
})
export class PaiementSection {
  /** Le terme **convenu** — celui qui fait foi. */
  readonly term = input.required<PaymentTerm>();
  /** Le terme **demandé** par le client, en attente d'arbitrage ; `null` = aucun. */
  readonly requestedTerm = input<PaymentTerm | null>(null);

  /** Ouvrir le panneau de condition de règlement. */
  readonly editTerm = output<void>();

  protected readonly termLabel = computed(() => PAYMENT_TERM_LABELS[this.term()]);
  protected readonly collection = computed(() => COLLECTION[this.term()]);

  /**
   * La demande du client, quand elle diffère de ce qui est convenu.
   *
   * Une demande **identique** au terme en place n'est pas une demande en
   * attente : la montrer ferait croire à un arbitrage à rendre alors qu'il l'a
   * déjà été.
   */
  protected readonly pendingRequest = computed(() => {
    const requested = this.requestedTerm();
    return requested === null || requested === this.term() ? null : PAYMENT_TERM_LABELS[requested];
  });
}
