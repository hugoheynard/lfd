import { canAddSlot, isSlot, withoutSlot, withSlot } from '../slot-list.model';

const MORNING = { start: '07:00', end: '08:00' };
const EVENING = { start: '18:00', end: '19:00' };

/** La liste de créneaux du carnet (CA3b) : triée, sans chevauchement, par construction. */
describe('liste de créneaux', () => {
  it('range un créneau ajouté à sa place', () => {
    expect(withSlot([EVENING], MORNING)).toEqual([MORNING, EVENING]);
  });

  it('refuse un créneau qui en chevauche un autre', () => {
    expect(withSlot([MORNING], { start: '07:30', end: '09:00' })).toEqual([MORNING]);
    expect(canAddSlot([MORNING], { start: '06:00', end: '10:00' })).toBe(false);
  });

  it('admet deux créneaux bord à bord', () => {
    expect(withSlot([MORNING], { start: '08:00', end: '09:00' })).toHaveLength(2);
  });

  it('ignore un créneau illisible ou à l’envers', () => {
    expect(isSlot('09:00', '08:00')).toBe(false);
    expect(isSlot('', '08:00')).toBe(false);
    expect(withSlot([], { start: '09:00', end: '09:00' })).toEqual([]);
  });

  it('retire un créneau', () => {
    expect(withoutSlot([MORNING, EVENING], MORNING)).toEqual([EVENING]);
  });
});
