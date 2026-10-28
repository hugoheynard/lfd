import { SaleQuantityPipe } from './sale-quantity.pipe';

describe('SaleQuantityPipe', () => {
  const pipe = new SaleQuantityPipe();

  it('écrit des pièces nues', () => {
    expect(pipe.transform(12, 'piece')).toBe('12');
  });

  it('lit une ligne sans unité comme des pièces (rétrocompatibilité)', () => {
    expect(pipe.transform(12)).toBe('12');
    expect(pipe.transform(12, null)).toBe('12');
  });

  it('dit des grammes sous le kilo et des kilos au-delà', () => {
    expect(pipe.transform(20, 'weight')).toBe('20 g');
    expect(pipe.transform(500, 'weight')).toBe('500 g');
    expect(pipe.transform(1250, 'weight')).toBe('1,25 kg');
    expect(pipe.transform(2000, 'weight')).toBe('2 kg');
  });

  it("n'écrit jamais des grammes comme des pièces", () => {
    expect(pipe.transform(1250, 'weight')).not.toBe('1250');
  });
});
