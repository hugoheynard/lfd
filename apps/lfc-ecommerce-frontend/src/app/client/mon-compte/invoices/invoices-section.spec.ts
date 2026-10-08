import { FR } from '../../copy/fr';
import { CREDIT_NOTE, SEPTEMBER } from './invoice.fixture';
import {
  basisPoints,
  invoiceMeta,
  invoiceQuantity,
  invoicesCount,
  unitPriceLabel,
} from './invoices-section';

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

  it('compte au singulier et au pluriel', () => {
    expect(invoicesCount(1, COPY)).toBe('1 facture');
    expect(invoicesCount(3, COPY)).toBe('3 factures');
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
