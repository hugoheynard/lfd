import { describe, expect, it } from 'vitest';

import type { AdminCompany, CompanyStatus } from '../../../comptes-clients/admin-company';
import { buildAcquisitionEvents } from '../acquisition-events';

/** Une société d'un statut/ancienneté donnés ; le reste des champs importe peu ici. */
function makeCompany(
  id: string,
  status: CompanyStatus,
  createdAt: string,
  hasOpenSupportRequest = false,
): AdminCompany {
  return {
    id,
    reference: `C-${id}`,
    raisonSociale: `Société ${id}`,
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '12345678901234',
    tvaIntracom: 'FR12345678901',
    status,
    paymentTerm: 'per_order',
    requestedPaymentTerm: null,
    primaryContact: { id: null, firstName: 'A', lastName: 'B', fonction: '', email: '', phone: '' },
    kbis: null,
    hasOpenSupportRequest,
    createdAt,
  };
}

const TODAY = '2026-08-02';

describe('buildAcquisitionEvents', () => {
  it('trace un repère d’inscription pour chaque société, au jour du createdAt', () => {
    const events = buildAcquisitionEvents(
      [makeCompany('1', 'active', '2026-07-30T10:00:00.000Z')],
      TODAY,
    );
    const inscription = events.find((e) => e.sourceKey === 'inscriptions');
    expect(inscription).toMatchObject({ id: 'insc:1', start: '2026-07-30', end: '2026-07-30' });
  });

  it('une société non-pending n’a QUE son inscription (pas de bande)', () => {
    const events = buildAcquisitionEvents(
      [makeCompany('1', 'active', '2026-06-01T00:00:00.000Z')],
      TODAY,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.sourceKey).toBe('inscriptions');
  });

  it('un pending sans assistance → bande « attente » ouverte jusqu’à today', () => {
    const events = buildAcquisitionEvents(
      [makeCompany('1', 'pending', '2026-07-30T10:00:00.000Z')],
      TODAY,
    );
    const band = events.find((e) => e.sourceKey === 'attente');
    expect(band).toMatchObject({ start: '2026-07-30', end: TODAY, openEnd: true });
  });

  it('un pending avec assistance → bande « rdv » en tone alert', () => {
    const events = buildAcquisitionEvents(
      [makeCompany('1', 'pending', '2026-08-01T09:00:00.000Z', true)],
      TODAY,
    );
    const band = events.find((e) => e.sourceKey === 'rdv');
    expect(band).toMatchObject({ id: 'rdv:1', tone: 'alert' });
    expect(events.some((e) => e.sourceKey === 'attente')).toBe(false);
  });

  it('la teinte de l’attente monte avec la durée : neutral < 7j, warning 7–13j, alert ≥ 14j', () => {
    const tone = (createdAt: string): string | undefined =>
      buildAcquisitionEvents([makeCompany('1', 'pending', createdAt)], TODAY).find(
        (e) => e.sourceKey === 'attente',
      )?.tone;

    expect(tone('2026-07-31T00:00:00.000Z')).toBe('neutral'); // 2 j
    expect(tone('2026-07-26T00:00:00.000Z')).toBe('warning'); // 7 j
    expect(tone('2026-07-19T00:00:00.000Z')).toBe('alert'); // 14 j
  });
});
