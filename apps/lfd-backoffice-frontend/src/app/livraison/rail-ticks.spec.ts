import { RAIL_TICKS_MAX, railTicks } from './rail-ticks';

describe('railTicks', () => {
  it('un trait par bac, par paquets de dix, les chargés d’abord', () => {
    const groups = railTicks(12, 23);
    expect(groups?.map((group) => group.length)).toEqual([10, 10, 3]);
    expect(groups?.flat().filter(Boolean)).toHaveLength(12);
    expect(groups?.[1]?.slice(0, 3)).toEqual([true, true, false]);
  });

  it('sans bac, ou trop de bacs pour des traits lisibles : pas de traits', () => {
    expect(railTicks(0, 0)).toBeNull();
    expect(railTicks(0, RAIL_TICKS_MAX + 1)).toBeNull();
  });
});
