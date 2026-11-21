import {
  fulfillmentLabel,
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

/** Régression : la fiche de commande disait « Retrait au laboratoire » quel que soit le point. */
describe('fulfillmentLabel — le point de retrait nommé', () => {
  it('nomme le point choisi', () => {
    expect(fulfillmentLabel('pickup', 'La Folie Bakery')).toBe('Retrait · La Folie Bakery');
  });

  it('dit « Retrait » seul quand le point n’a pas de nom', () => {
    expect(fulfillmentLabel('pickup')).toBe('Retrait');
    expect(fulfillmentLabel('pickup', '  ')).toBe('Retrait');
    expect(fulfillmentLabel('pickup', null)).toBe('Retrait');
  });

  it('dit la livraison, sans point', () => {
    expect(fulfillmentLabel('delivery', 'La Folie Bakery')).toBe('Livraison par coursier');
  });
});
