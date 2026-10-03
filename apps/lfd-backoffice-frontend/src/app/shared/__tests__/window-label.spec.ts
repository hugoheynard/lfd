import { describe, expect, it } from 'vitest';

import { fulfillmentWindowLabel, timeLabel } from '../window-label';

describe('fulfillmentWindowLabel', () => {
  it('écrit un créneau avec ses deux bornes', () => {
    expect(fulfillmentWindowLabel({ start: '08:00', end: '10:30' })).toBe('8 h 00 – 10 h 30');
  });

  it('écrit une échéance « avant HH:MM » — jamais « 0 h 00 – … »', () => {
    expect(fulfillmentWindowLabel({ start: null, end: '06:00' })).toBe('avant 6 h 00');
  });
});

describe('timeLabel', () => {
  it('rend telle quelle une heure illisible', () => {
    expect(timeLabel('midi')).toBe('midi');
  });
});
