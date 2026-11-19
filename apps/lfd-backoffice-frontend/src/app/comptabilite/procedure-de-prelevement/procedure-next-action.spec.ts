import { describe, expect, it } from 'vitest';

import { procedureRow } from '../__tests__/collection-procedure-fixture';
import { nextActionOf } from './procedure-next-action';

/** « À faire » : la ligne la plus urgente et son geste, ou rien. */
describe('nextActionOf', () => {
  it('une clôture manquée passe avant tout, en alerte', () => {
    const missed = procedureRow({ id: 'missed', phase: 'missed' });
    const action = nextActionOf([procedureRow(), missed]);
    expect(action.row?.id).toBe('missed');
    expect(action.tone).toBe('alert');
    expect(action.text).toContain('préparer la dernière clôture');
  });

  it('la limite la plus proche d’abord, avec son geste', () => {
    const later = procedureRow({
      id: 'later',
      depositDeadline: { day: '2026-12-20', time: '13:45' },
    });
    const sooner = procedureRow({
      id: 'sooner',
      stage: 'mandates',
      depositDeadline: { day: '2026-12-10', time: '13:45' },
    });
    const action = nextActionOf([later, sooner]);
    expect(action.row?.id).toBe('sooner');
    expect(action.text).toMatch(
      /^Importer les mandats à la banque avant le 10 déc\. 2026 à 13:45 — /,
    );
    expect(action.tone).toBe('warning');
  });

  it('sans lot : préparer le fichier ; limite dépassée : en alerte', () => {
    const row = procedureRow({
      batches: [],
      followedBatchId: null,
      orderCount: 4,
      warnings: [{ code: 'deadline_passed', count: null }],
    });
    const action = nextActionOf([row]);
    expect(action.text).toMatch(/^Préparer le fichier avant le /);
    expect(action.text).toContain('la limite est dépassée');
    expect(action.tone).toBe('alert');
  });

  it('un fichier déposé qui attend la banque, une période vide : rien à faire, et la prochaine clôture', () => {
    const deposited = procedureRow({ deposited: true });
    const empty = procedureRow({ id: 'empty', orderCount: 0, batches: [] });
    const upcoming = procedureRow({ id: 'up', phase: 'upcoming', closureDay: '2026-12-01' });
    const action = nextActionOf([upcoming, deposited, empty]);
    expect(action.row).toBeNull();
    expect(action.tone).toBe('neutral');
    expect(action.text).toBe('Rien à faire pour l’instant. Prochaine clôture le 1 déc. 2026.');
  });
});
