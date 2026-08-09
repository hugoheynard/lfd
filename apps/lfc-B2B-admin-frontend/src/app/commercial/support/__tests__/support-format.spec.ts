import { describe, expect, it } from 'vitest';
import type { SupportRequestView } from '@lfd/contracts';

import { availabilityLabel, isLate, waitingLabel } from '../support-format';

const NOW = new Date('2026-08-12T10:00:00.000Z');

function request(overrides: Partial<SupportRequestView> = {}): SupportRequestView {
  return {
    id: 'sup_1',
    companyId: null,
    requestedByUserId: 'usr_1',
    channel: 'phone',
    purpose: 'discover',
    phoneNumber: '0102030405',
    asap: true,
    scheduledDate: null,
    slot: null,
    message: '',
    handledAt: null,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('la disponibilité annoncée', () => {
  it('dit « au plus vite » pour un rappel non daté', () => {
    expect(availabilityLabel(request())).toBe('Rappel au plus vite');
  });

  it('rend le jour ET la demi-journée quand le créneau est daté', () => {
    const label = availabilityLabel(
      request({ asap: false, scheduledDate: '2026-08-18', slot: 'morning' }),
    );
    expect(label).toBe('Rappel mardi 18 août matin');
  });

  it('ne parle NI de rappel NI de créneau sur un contact par e-mail', () => {
    // Le canal e-mail ne porte ni numéro ni créneau : annoncer un rappel
    // promettrait un appel que personne ne passera.
    const label = availabilityLabel(
      request({ channel: 'email', asap: false, scheduledDate: null, slot: null }),
    );
    expect(label).toBe('Réponse par e-mail');
  });

  it('reste lisible quand un rappel programmé a perdu sa date', () => {
    expect(availabilityLabel(request({ asap: false }))).toBe('Rappel à programmer');
  });
});

describe("le temps d'attente", () => {
  it('reste discret dans les cinq premières minutes', () => {
    const created = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    expect(waitingLabel(created, NOW)).toBe("à l'instant");
  });

  it('passe aux minutes, puis aux heures, puis aux jours', () => {
    const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
    expect(waitingLabel(ago(20 * 60_000), NOW)).toBe('20 min');
    expect(waitingLabel(ago(3 * 3_600_000), NOW)).toBe('3 h');
    expect(waitingLabel(ago(50 * 3_600_000), NOW)).toBe('2 j');
  });
});

describe('le retard', () => {
  it("ne signale rien avant 24 h — c'est une file, pas une alarme", () => {
    const created = new Date(NOW.getTime() - 23 * 3_600_000).toISOString();
    expect(isLate(request({ createdAt: created }), NOW)).toBe(false);
  });

  it('signale dès 24 h révolues : la promesse de rappel est rompue', () => {
    const created = new Date(NOW.getTime() - 24 * 3_600_000).toISOString();
    expect(isLate(request({ createdAt: created }), NOW)).toBe(true);
  });
});
