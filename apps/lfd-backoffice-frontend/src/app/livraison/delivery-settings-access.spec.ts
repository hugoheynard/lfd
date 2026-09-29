import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { canReadDeliverySettings } from './delivery-settings-access';

function holding(...granted: StaffPermission[]): (permission: StaffPermission) => boolean {
  return (permission) => granted.includes(permission);
}

describe('canReadDeliverySettings (Q10 « A »)', () => {
  it('ouvre la lecture sous le droit des réglages', () => {
    expect(canReadDeliverySettings(holding('delivery_settings:read'))).toBe(true);
  });

  it('ouvre la lecture à qui lit les tournées, sans le droit des réglages', () => {
    expect(canReadDeliverySettings(holding('delivery_rounds:read'))).toBe(true);
  });

  it('reste fermée à qui n’a ni l’un ni l’autre', () => {
    expect(
      canReadDeliverySettings(holding('delivery_run_sheet:read', 'delivery_loading:read')),
    ).toBe(false);
  });
});
