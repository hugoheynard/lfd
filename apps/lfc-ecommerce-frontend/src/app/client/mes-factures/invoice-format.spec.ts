import { FR } from '../copy/fr';
import { CREDIT_NOTE, SEPTEMBER } from './invoice.fixture';
import {
  basisPoints,
  invoiceMeta,
  invoiceQuantity,
  monthName,
  rejectedWithOthers,
  settlementLabel,
  settlementTone,
  unitPriceLabel,
} from './invoice-format';

const COPY = FR.account.invoices;

describe('les mises en forme de « Mes factures »', () => {
  it('dit émission, période et échéance d’une facture, la pièce corrigée d’un avoir', () => {
    expect(invoiceMeta(SEPTEMBER, COPY, 'fr')).toBe(
      'émise le 30 sept. 2026 · commandes de septembre 2026 · échéance le 15 oct. 2026',
    );
    expect(invoiceMeta(CREDIT_NOTE, COPY, 'fr')).toBe(
      'émise le 30 sept. 2026 · corrige la facture FA-2026-000007',
    );
  });

  it('dit le statut et sa date, ou le statut seul quand il n’en a pas', () => {
    expect(
      settlementLabel(
        { status: 'collected', date: '2026-10-05', otherInvoicesOnDebit: 0 },
        COPY,
        'fr',
      ),
    ).toBe('Prélevée le 5 oct. 2026');
    expect(
      settlementLabel({ status: 'settled', date: null, otherInvoicesOnDebit: 0 }, COPY, 'fr'),
    ).toBe('Réglée');
  });

  it('ne met en défaut que le rejet', () => {
    expect(settlementTone('collection_rejected')).toBe('alert');
    expect(settlementTone('processing')).toBe('neutral');
    expect(settlementTone('collection_planned')).toBe('info');
    expect(settlementTone('recollection_planned')).toBe('info');
    expect(settlementTone('collected')).toBe('success');
    expect(settlementTone('card_paid')).toBe('success');
    expect(settlementTone('settled')).toBe('success');
    expect(settlementTone('closed')).toBe('neutral');
  });

  it('dit les autres factures d’un prélèvement rejeté, et seulement d’un rejet', () => {
    const rejected = { status: 'collection_rejected', date: '2026-10-08' } as const;
    expect(rejectedWithOthers({ ...rejected, otherInvoicesOnDebit: 2 }, COPY)).toBe(
      'rejeté avec 2 autres factures du même prélèvement',
    );
    expect(rejectedWithOthers({ ...rejected, otherInvoicesOnDebit: 1 }, COPY)).toBe(
      'rejeté avec 1 autre facture du même prélèvement',
    );
    expect(rejectedWithOthers({ ...rejected, otherInvoicesOnDebit: 0 }, COPY)).toBeNull();
    expect(
      rejectedWithOthers({ status: 'collected', date: null, otherInvoicesOnDebit: 2 }, COPY),
    ).toBeNull();
  });

  it('nomme les mois', () => {
    expect(monthName(9, 'fr')).toBe('septembre');
  });

  it('écrit quantités, prix et taux en entiers, sans flottant', () => {
    expect(invoiceQuantity({ quantityThousandths: 2_000, unitCode: 'H87' })).toBe('2');
    expect(invoiceQuantity({ quantityThousandths: 1_250, unitCode: 'KGM' })).toBe('1,250 kg');
    expect(unitPriceLabel(500_000)).toBe('5,00 €');
    expect(unitPriceLabel(123_450)).toBe('1,2345 €');
    expect(basisPoints(1_415)).toBe('14,15 %');
    expect(basisPoints(1_000)).toBe('10 %');
  });
});
