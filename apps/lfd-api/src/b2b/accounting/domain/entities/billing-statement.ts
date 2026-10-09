import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  StatementTotalMismatchError,
  StatementWithoutOrdersError,
} from "../errors/billing-statement-errors.js";
import type { FrozenInvoiceOrder, Invoice } from "../services/invoice-dossier.types.js";

/**
 * La forme de `body` que cet arrêté écrit. Elle change quand le JSON change de
 * forme — une clé ajoutée, renommée, retirée — jamais quand le calcul change.
 */
export const STATEMENT_BODY_VERSION = 1;

/**
 * Le calcul qui a produit `body` et les totaux : le simulateur du dossier de
 * facturation (`simulateInvoiceDossier`). Une VALEUR : un arrêté écrit sous un
 * calcul le garde, même quand le calcul évolue.
 *
 * - `invoice-dossier/2026-10-08` — lot F3 : montant de ligne
 *   `arrondi(Σ quantité × prix)`, une fois ;
 * - `invoice-dossier/2026-10-08-f6` — lot F6 : montant de ligne repris des
 *   bons (Σ `lineTotalCents`). La forme du JSON n'a pas bougé, `body_version`
 *   non plus (`bons-et-facture-concordants.md`).
 */
export const STATEMENT_COMPUTED_WITH = "invoice-dossier/2026-10-08-f6";

/**
 * Le vendeur, **figé** : ce qu'une facture imprime de l'émetteur. Une copie
 * partielle du {@link CreditorSnapshot} de la constitution — sans le délai de
 * pré-notification ni les zones du mandat, qui ne regardent pas la facture.
 */
export type StatementSeller = Pick<
  CreditorSnapshot,
  | "legalEntityId"
  | "name"
  | "legalForm"
  | "siren"
  | "vatNumber"
  | "rcs"
  | "shareCapitalCents"
  | "addressLines"
  | "ics"
  | "creditorIban"
  | "creditorBic"
>;

/**
 * L'acheteur, **figé** : l'identité légale de la société payeuse, telle que sa
 * fiche la porte au jour de la constitution.
 *
 * 🔴 Ce n'est PAS le `DebtorSnapshot` du mandat : celui-ci porte l'IBAN en
 * clair, et il « ne se range nulle part ». Une facture n'en a pas besoin.
 * Un champ vide est inconnu de la fiche — jamais deviné.
 */
export interface StatementBuyer {
  readonly companyId: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siret: string;
  readonly siren: string;
  readonly vatNumber: string;
  /** L'adresse de facturation, prête à imprimer ; vide quand la fiche n'en a pas. */
  readonly billingAddressLines: readonly string[];
}

/** Un bon couvert par l'arrêté : son identifiant opaque et ce qu'il a figé. */
export interface StatementOrder {
  readonly orderId: string;
  readonly frozen: FrozenInvoiceOrder;
}

export interface IssueStatementInput {
  readonly id: string;
  readonly batchId: string;
  readonly lineRank: number;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly seller: StatementSeller;
  readonly buyer: StatementBuyer;
  /** `AAAA-MM-JJ`, le jour (Paris) de la constitution. */
  readonly issuedOn: string;
  readonly orders: readonly StatementOrder[];
  /** La facture calculée UNE fois par la constitution — jamais recalculée ici. */
  readonly invoice: Invoice;
  readonly ordersTotalCents: number;
  /** Ce que la ligne de débit prélève : doit être le total de la facture. */
  readonly lineAmountCents: number;
}

export interface BillingStatementState {
  readonly id: string;
  readonly batchId: string;
  readonly lineRank: number;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly seller: StatementSeller;
  readonly buyer: StatementBuyer;
  readonly issuedOn: string;
  /** Première et dernière date de livraison demandée des bons ; `null` si aucun n'en porte. */
  readonly periodStartsOn: string | null;
  readonly periodEndsOn: string | null;
  readonly totalHtCents: number;
  readonly totalVatCents: number;
  readonly totalTtcCents: number;
  readonly ordersTotalCents: number;
  readonly orderIds: readonly string[];
  readonly body: Invoice;
  readonly bodyVersion: number;
  readonly computedWith: string;
}

/**
 * **L'arrêté de facturation** — ce qu'une ligne de débit prélève, figé
 * (plan `le-prelevement-suit-la-facture.md`).
 *
 * Il naît actif avec la constitution du lot et ne change plus : il n'a
 * AUCUNE méthode de mutation. Son annulation est celle du lot
 * (`BillingStatementRepository.cancelForBatch`), que `CollectionBatch.cancel`
 * garde — seul un lot `constituted` s'annule — et que la base garde aussi
 * (déclencheur `billing_statement_immutable`).
 *
 * L'invariant qu'il porte : **son total TTC EST le montant de la ligne.** La
 * banque, notre facture et demain un logiciel comptable lisent ce chiffre ;
 * un écart serait une facture qui ne correspond pas au prélèvement.
 */
export class BillingStatement {
  private constructor(private readonly state: BillingStatementState) {}

  /**
   * @throws {StatementWithoutOrdersError} aucun bon.
   * @throws {StatementTotalMismatchError} la ligne ne prélève pas le total de la facture.
   */
  static issue(input: IssueStatementInput): BillingStatement {
    const { invoice } = input;
    if (input.orders.length === 0) {
      throw new StatementWithoutOrdersError(input.batchId, input.lineRank);
    }
    if (invoice.totalCents !== input.lineAmountCents) {
      throw new StatementTotalMismatchError(
        input.batchId,
        input.lineRank,
        input.lineAmountCents,
        invoice.totalCents,
      );
    }
    const period = deliveryPeriodOf(input.orders);
    return new BillingStatement({
      id: input.id,
      batchId: input.batchId,
      lineRank: input.lineRank,
      legalEntityId: input.legalEntityId,
      payerCompanyId: input.payerCompanyId,
      seller: input.seller,
      buyer: input.buyer,
      issuedOn: input.issuedOn,
      periodStartsOn: period?.first ?? null,
      periodEndsOn: period?.last ?? null,
      totalHtCents: invoice.vat.taxableBaseCents,
      totalVatCents: invoice.vat.vatCents,
      totalTtcCents: invoice.totalCents,
      ordersTotalCents: input.ordersTotalCents,
      orderIds: input.orders.map((order) => order.orderId),
      body: invoice,
      bodyVersion: STATEMENT_BODY_VERSION,
      computedWith: STATEMENT_COMPUTED_WITH,
    });
  }

  get id(): string {
    return this.state.id;
  }

  toPersistence(): BillingStatementState {
    return this.state;
  }
}

/** Les dates demandées des bons, triées ; `null` quand aucun bon n'en porte. */
function deliveryPeriodOf(
  orders: readonly StatementOrder[],
): { readonly first: string; readonly last: string } | null {
  const days = orders
    .map((order) => order.frozen.requestedDeliveryDate)
    .filter((day): day is string => day !== null)
    .sort();
  const first = days[0];
  const last = days[days.length - 1];
  return first === undefined || last === undefined ? null : { first, last };
}

/** La seule ligne du vendeur que la facture imprime — sans les réglages du mandat. */
export function statementSellerOf(creditor: CreditorSnapshot): StatementSeller {
  return {
    legalEntityId: creditor.legalEntityId,
    name: creditor.name,
    legalForm: creditor.legalForm,
    siren: creditor.siren,
    vatNumber: creditor.vatNumber,
    rcs: creditor.rcs,
    shareCapitalCents: creditor.shareCapitalCents,
    addressLines: creditor.addressLines,
    ics: creditor.ics,
    creditorIban: creditor.creditorIban,
    creditorBic: creditor.creditorBic,
  };
}
