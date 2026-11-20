import {
  orderStatusLabel,
  orderStatusVariant,
  settlementStatusLabel,
  settlementStatusVariant,
} from '../order-format';

describe('orderStatusLabel — plan E7 reliquat', () => {
  it('dit « En partie retirée », en attente : un reste n’est pas encore parti', () => {
    expect(orderStatusLabel('partially_handed_over')).toBe('En partie retirée');
    expect(orderStatusVariant('partially_handed_over')).toBe('warning');
  });
});

describe('orderStatusLabel — la commande que le client n’est pas venu retirer', () => {
  it('dit « Non retirée », en échec comme une annulée', () => {
    expect(orderStatusLabel('no_show')).toBe('Non retirée');
    expect(orderStatusVariant('no_show')).toBe('alert');
  });
});

describe('settlementStatusLabel — une commande à régler à la caisse de la boutique', () => {
  it('dit « À régler en boutique », jamais « au compte » ni « payée »', () => {
    const order = { paymentStatus: 'not_required', settlement: 'shop_till' } as const;

    expect(settlementStatusLabel(order)).toBe('À régler en boutique');
    expect(settlementStatusVariant(order)).toBe('neutral');
  });

  it('garde le libellé du règlement pour toute autre commande', () => {
    expect(settlementStatusLabel({ paymentStatus: 'not_required', settlement: 'account' })).toBe(
      'Au compte — à facturer',
    );
    expect(settlementStatusLabel({ paymentStatus: 'paid', settlement: 'paid' })).toBe('Payée');
  });
});
