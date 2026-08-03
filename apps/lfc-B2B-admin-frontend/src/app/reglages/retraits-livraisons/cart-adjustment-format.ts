import type { CartAdjustment } from '@lfd/contracts';

/** Un {@link CartAdjustment} en texte court : « 20 % » ou « 20,00 € ». */
export function formatAdjustment(adjustment: CartAdjustment): string {
  return adjustment.mode === 'percent'
    ? `${adjustment.bp / 100} %`
    : `${(adjustment.cents / 100).toFixed(2).replace('.', ',')} €`;
}
