import type { AppointmentStatus, AppointmentView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { APPOINTMENT_SOURCE, buildAppointmentEvents } from '../appointment-events';

/**
 * Ce que fige cette spec : un rendez-vous est posé à son **heure réelle** (et non
 * en bande de journée), son état se lit à la **couleur**, et un rendez-vous
 * annulé ne pollue pas la file du commercial.
 */
function appointment(overrides: Partial<AppointmentView> = {}): AppointmentView {
  return {
    id: 'appt_1',
    startAt: '2026-06-10T07:00:00.000Z',
    endAt: '2026-06-10T07:30:00.000Z',
    day: '2026-06-10',
    time: '09:00',
    endTime: '09:30',
    status: 'requested',
    channel: 'phone',
    purpose: 'discover',
    subjectType: 'company',
    subjectId: 'cmp_1',
    contactName: 'Camille Roy',
    contactEmail: 'camille@exemple.fr',
    contactPhone: '0600000000',
    message: '',
    cancelReason: '',
    rescheduledFromId: null,
    createdAt: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('buildAppointmentEvents', () => {
  it('pose le rendez-vous à son heure locale, pas en bande de journée', () => {
    const [event] = buildAppointmentEvents([appointment()]);
    expect(event).toMatchObject({
      id: 'appt:appt_1',
      start: '2026-06-10',
      end: '2026-06-10',
      startTime: '09:00',
      endTime: '09:30',
      sourceKey: APPOINTMENT_SOURCE.key,
    });
  });

  it("promène le rendez-vous complet en donnée, pour le panneau d'actions", () => {
    const source = appointment();
    expect(buildAppointmentEvents([source])[0]?.data).toBe(source);
  });

  it('donne un ton par état', () => {
    const tones: Record<string, string | undefined> = {};
    const statuses: AppointmentStatus[] = ['requested', 'confirmed', 'honored', 'no_show'];
    for (const status of statuses) {
      tones[status] = buildAppointmentEvents([appointment({ status })])[0]?.tone;
    }
    expect(tones).toEqual({
      requested: 'warning',
      confirmed: 'neutral',
      honored: 'success',
      no_show: 'alert',
    });
  });

  it("annonce l'état et le canal en seconde ligne", () => {
    const [event] = buildAppointmentEvents([
      appointment({ status: 'confirmed', channel: 'visio' }),
    ]);
    expect(event?.subline).toBe('Confirmé · Visio');
  });

  it("écarte les annulés par défaut — la file dit ce qu'il reste à faire", () => {
    const rows = [appointment(), appointment({ id: 'appt_2', status: 'cancelled' })];
    expect(buildAppointmentEvents(rows)).toHaveLength(1);
  });

  it('sait quand même les montrer à la demande', () => {
    const rows = [appointment(), appointment({ id: 'appt_2', status: 'cancelled' })];
    const events = buildAppointmentEvents(rows, { includeCancelled: true });
    expect(events).toHaveLength(2);
    expect(events[1]?.tone).toBe('muted');
  });

  it("retombe sur l'e-mail puis sur l'identifiant quand le nom manque", () => {
    expect(buildAppointmentEvents([appointment({ contactName: '  ' })])[0]?.label).toBe(
      'camille@exemple.fr',
    );
    expect(
      buildAppointmentEvents([appointment({ contactName: '', contactEmail: '' })])[0]?.label,
    ).toBe('cmp_1');
  });
});
