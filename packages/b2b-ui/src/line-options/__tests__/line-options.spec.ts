import {
  choiceCeilingOf,
  lineOptionMentions,
  offeredChoicesOnly,
  optionChoicesField,
  settleLineOptions,
  withChoiceQuantity,
  type LineOptionChoice,
} from '../line-options';

const SLICED = { group: 'grp_slicing', choice: 'sliced' };
const THIN = { group: 'grp_slicing', choice: 'thin' };
const GIFT = { group: 'grp_wrap', choice: 'gift' };

describe('les options d’une ligne — « dont N tranchés »', () => {
  it('borne un choix à la pièce à ce que son groupe laisse, le reste est « sans »', () => {
    const choices: LineOptionChoice[] = [{ ...THIN, quantity: 3 }];
    expect(choiceCeilingOf(choices, SLICED.group, SLICED.choice, 4)).toBe(1);
    expect(withChoiceQuantity(choices, SLICED, 9, { quantity: 4 })).toEqual([
      { ...THIN, quantity: 3 },
      { ...SLICED, quantity: 1 },
    ]);
  });

  it('compte deux groupes indépendamment', () => {
    const choices = withChoiceQuantity([{ ...SLICED, quantity: 4 }], GIFT, 4, { quantity: 4 });
    expect(choices).toEqual([
      { ...SLICED, quantity: 4 },
      { ...GIFT, quantity: 4 },
    ]);
  });

  it('retire un choix ramené à zéro', () => {
    expect(withChoiceQuantity([{ ...SLICED, quantity: 2 }], SLICED, 0, { quantity: 4 })).toEqual(
      [],
    );
  });

  it('au poids, le choix vaut pour toute la ligne et chasse son voisin de groupe', () => {
    const line = { quantity: 1200, saleUnit: 'weight' as const };
    const sliced = withChoiceQuantity([], SLICED, 1, line);
    expect(sliced).toEqual([{ ...SLICED, quantity: 1200 }]);
    expect(withChoiceQuantity(sliced, THIN, 1, line)).toEqual([{ ...THIN, quantity: 1200 }]);
  });

  it('une ligne qui diminue réduit d’abord le « sans », puis le dernier choix', () => {
    const choices: LineOptionChoice[] = [
      { ...SLICED, quantity: 2 },
      { ...THIN, quantity: 2 },
    ];
    expect(settleLineOptions(choices, { quantity: 5 })).toEqual(choices);
    expect(settleLineOptions(choices, { quantity: 3 })).toEqual([
      { ...SLICED, quantity: 2 },
      { ...THIN, quantity: 1 },
    ]);
    expect(settleLineOptions(choices, { quantity: 2 })).toEqual([{ ...SLICED, quantity: 2 }]);
  });

  it('au poids, les choix suivent la ligne entière', () => {
    expect(
      settleLineOptions([{ ...SLICED, quantity: 1000 }], { quantity: 1500, saleUnit: 'weight' }),
    ).toEqual([{ ...SLICED, quantity: 1500 }]);
  });

  it('ne garde que les choix encore proposés', () => {
    const groups = [
      { id: 'grp_slicing', name: 'Tranchage', choices: [{ key: 'sliced', label: 'tranché' }] },
    ];
    expect(
      offeredChoicesOnly(
        [
          { ...SLICED, quantity: 1 },
          { ...THIN, quantity: 1 },
          { ...GIFT, quantity: 1 },
        ],
        groups,
      ),
    ).toEqual([{ ...SLICED, quantity: 1 }]);
  });

  it('n’écrit pas le champ quand il n’y a rien : la ligne garde sa forme d’avant', () => {
    expect(optionChoicesField([])).toEqual({});
    expect(optionChoicesField(undefined)).toEqual({});
    expect(optionChoicesField([{ ...SLICED, quantity: 2 }])).toEqual({
      optionChoices: [{ ...SLICED, quantity: 2 }],
    });
  });

  it('dit « dont 2 tranché », et le libellé seul quand il vaut pour toute la ligne', () => {
    const frozen = (quantity: number) => ({ choiceLabel: 'tranché', quantity });
    expect(lineOptionMentions({ quantity: 4, optionChoices: [frozen(2)] })).toEqual([
      'dont 2 tranché',
    ]);
    expect(lineOptionMentions({ quantity: 4, optionChoices: [frozen(4)] })).toEqual(['tranché']);
    expect(
      lineOptionMentions({ quantity: 1200, saleUnit: 'weight', optionChoices: [frozen(1200)] }),
    ).toEqual(['tranché']);
    expect(lineOptionMentions({ quantity: 4 })).toEqual([]);
    expect(
      lineOptionMentions(
        { quantity: 4, optionChoices: [frozen(1)] },
        { some: '{n} of them {label}' },
      ),
    ).toEqual(['1 of them tranché']);
  });
});
