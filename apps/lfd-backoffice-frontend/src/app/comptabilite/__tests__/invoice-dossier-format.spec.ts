import { describe, expect, it } from 'vitest';

import {
  deliveryModeLabel,
  hasAlerts,
  historyLabel,
  historyNodes,
  legacyDeliveryOrders,
  linePeriod,
  nonZero,
  partLabel,
  placeLabel,
  ratePercent,
  signedEuros,
  unitPrice,
} from '../invoice-dossier-format';
import { dossier, dossierOrder } from './invoice-dossier-fixture';

/** L'espace insécable que `Intl` pose avant `€` — on compare le texte, pas l'espace. */
const plain = (text: string): string => text.replace(/[\u00a0\u202f]/gu, ' ');

describe('la mise en mots du dossier de facturation', () => {
  it('écrit le prix unitaire à ses cinq décimales, sans flottant', () => {
    expect(plain(unitPrice(123_450))).toBe('1,23450 €');
    expect(plain(unitPrice(7))).toBe('0,00007 €');
    expect(plain(unitPrice(123_456_789))).toBe('1 234,56789 €');
  });

  it('signe un écart, et laisse le zéro sans signe', () => {
    expect(plain(signedEuros(2))).toBe('+0,02 €');
    expect(plain(signedEuros(-1))).toBe('−0,01 €');
    expect(plain(signedEuros(0))).toBe('0,00 €');
  });

  it('écrit un taux à la française', () => {
    expect(ratePercent(5.5)).toBe('5,5 %');
    expect(ratePercent(20)).toBe('20 %');
  });

  it('nomme les deux modes de TVA de la livraison', () => {
    expect(deliveryModeLabel('standard')).toBe('TVA 20 %');
    expect(deliveryModeLabel('follows_goods')).toBe('TVA au prorata des produits');
  });

  it('nomme chaque nature de remise et de frais, surtaxe comprise quel que soit son taux', () => {
    expect(partLabel('company_discount')).toBe('Remise société');
    expect(partLabel('loyalty_voucher')).toBe('Bon de fidélité');
    expect(partLabel('delivery_follows_goods')).toBe('Livraison (au prorata des produits)');
    expect(partLabel('late_fee:20')).toBe('Surtaxe de retard');
    // Une clé inconnue reste lisible plutôt que de disparaître.
    expect(partLabel('autre')).toBe('autre');
  });

  it('dit la période d’une ligne : une plage, un jour, ou « sans date »', () => {
    const line = dossier().invoice.lines[0]!;
    expect(linePeriod(line)).toMatch(/^du 3 oct\.? 2026 au 17 oct\.? 2026$/u);
    expect(linePeriod({ ...line, lastDeliveryDate: '2026-10-03' })).toMatch(/^3 oct\.? 2026$/u);
    expect(linePeriod({ ...line, firstDeliveryDate: null, lastDeliveryDate: null })).toBe(
      'sans date',
    );
  });

  it('dit le lieu, et le dit encore quand l’adresse est illisible', () => {
    expect(placeLabel({ method: 'pickup', label: 'Labo', address: '1 rue du Four' })).toBe(
      'Retrait : Labo — 1 rue du Four',
    );
    expect(placeLabel({ method: 'delivery', label: null, address: null })).toBe(
      'Livraison, adresse illisible',
    );
  });

  it('distingue le retrait par scan du retrait saisi', () => {
    const at = '2026-10-03T08:00:00.000Z';
    expect(historyLabel({ kind: 'handed_over', at, serviceDay: null, via: 'scan' })).toBe(
      'Retiré au comptoir (scan)',
    );
    expect(historyLabel({ kind: 'handed_over', at, serviceDay: null, via: 'manual' })).toBe(
      'Retiré au comptoir (saisie)',
    );
  });

  it('fait une frise inerte, qui nomme la tournée d’un fait de livraison', () => {
    const order = dossierOrder({
      history: [
        { kind: 'departed', at: '2026-10-03T06:00:00.000Z', serviceDay: '2026-10-03', via: null },
        {
          kind: 'brought_back',
          at: '2026-10-03T12:00:00.000Z',
          serviceDay: '2026-10-03',
          via: null,
        },
      ],
    });
    const nodes = historyNodes(order);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.clickable).toBe(false);
    expect(nodes[0]?.label).toMatch(/^Parti en tournée — tournée du 3 oct/u);
    expect(nodes[1]?.label).toMatch(/^Rapporté/u);
  });

  it('ne lit au taux normal que les bons d’avant le réglage qui ont un port', () => {
    const view = dossier({
      orders: [
        dossierOrder({ reference: 'A', deliveryVatMode: null, deliveryFeeCents: 500 }),
        dossierOrder({ reference: 'B', deliveryVatMode: null, deliveryFeeCents: 0 }),
        dossierOrder({ reference: 'C', deliveryVatMode: 'follows_goods', deliveryFeeCents: 500 }),
      ],
    });
    expect(legacyDeliveryOrders(view)).toEqual(['A']);
  });

  it('voit un signalement dès qu’un seul est présent, invariant compris', () => {
    expect(hasAlerts(dossier())).toBe(false);
    expect(hasAlerts(dossier({ neverHandedOver: ['A'] }))).toBe(true);
    expect(hasAlerts(dossier({ ordersWithoutDate: ['A'] }))).toBe(true);
    expect(hasAlerts(dossier({ threeGapInvariantHolds: false }))).toBe(true);
    expect(
      hasAlerts(dossier({ issuanceBlockers: [{ code: 'buyer_siren_missing', message: 'x' }] })),
    ).toBe(true);
  });

  it('écarte les écarts nuls, qui n’expliquent rien', () => {
    expect(nonZero(dossier().gaps.vatRounding).map((gap) => gap.rate)).toEqual([5.5]);
  });
});
