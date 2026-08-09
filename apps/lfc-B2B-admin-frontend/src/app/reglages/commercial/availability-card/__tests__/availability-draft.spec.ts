import type { AvailabilityConfigView, BookingPolicy } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  addException,
  addRange,
  clearDay,
  copyToWeekdays,
  draftFrom,
  editRange,
  emptyDraft,
  gridPayload,
  hasInvalidRange,
  removeException,
  removeRange,
  toPayload,
  withPolicy,
  type AvailabilityDraft,
} from '../availability-draft';

/**
 * Le brouillon est la seule logique de l'écran de disponibilités. Le tester ici
 * dispense d'un test de rendu pour chaque geste — et surtout, ça fige le
 * comportement qui compte : rien ne part au serveur tant qu'on n'enregistre pas,
 * et une plage incohérente ne fait pas perdre le reste de la saisie.
 */
const POLICY: BookingPolicy = {
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 30,
  channels: ['phone'],
};

function base(): AvailabilityDraft {
  return emptyDraft(POLICY);
}

describe('emptyDraft', () => {
  it('ouvre sept journées vides', () => {
    const draft = base();
    expect(draft.week).toHaveLength(7);
    expect(draft.week.every((day) => day.length === 0)).toBe(true);
  });
});

describe('draftFrom', () => {
  it('range chaque règle sur son jour, triée par heure de début', () => {
    const config: AvailabilityConfigView = {
      rules: [
        { id: 'r1', weekday: 2, startTime: '14:00', endTime: '17:00' },
        { id: 'r2', weekday: 2, startTime: '09:00', endTime: '12:00' },
        { id: 'r3', weekday: 5, startTime: '09:00', endTime: '10:00' },
      ],
      exceptions: [
        {
          id: 'e1',
          day: '2026-12-25',
          kind: 'closed',
          startTime: null,
          endTime: null,
          reason: 'Noël',
        },
      ],
      policy: POLICY,
    };
    const draft = draftFrom(config);
    expect(draft.week[2]).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
    expect(draft.week[5]).toHaveLength(1);
    expect(draft.week[0]).toEqual([]);
    expect(draft.exceptions[0]?.reason).toBe('Noël');
  });

  it("fait l'aller-retour avec toPayload sans rien perdre", () => {
    const config: AvailabilityConfigView = {
      rules: [{ id: 'r1', weekday: 3, startTime: '09:00', endTime: '12:00' }],
      exceptions: [
        { id: 'e1', day: '2026-07-14', kind: 'closed', startTime: null, endTime: null, reason: '' },
      ],
      policy: POLICY,
    };
    const payload = toPayload(draftFrom(config));
    expect(payload.rules).toEqual([{ weekday: 3, startTime: '09:00', endTime: '12:00' }]);
    expect(payload.exceptions).toHaveLength(1);
    expect(payload.policy).toEqual(POLICY);
  });
});

describe('les gestes sur la semaine', () => {
  it('ajoute une plage par défaut, puis la retire', () => {
    const added = addRange(base(), 1);
    expect(added.week[1]).toEqual([{ startTime: '09:00', endTime: '12:00' }]);
    expect(removeRange(added, 1, 0).week[1]).toEqual([]);
  });

  it("garde les plages triées à l'ajout", () => {
    let draft = addRange(base(), 1, { startTime: '14:00', endTime: '17:00' });
    draft = addRange(draft, 1, { startTime: '09:00', endTime: '12:00' });
    expect(draft.week[1]?.map((r) => r.startTime)).toEqual(['09:00', '14:00']);
  });

  it('édite une borne sans toucher aux autres plages', () => {
    let draft = addRange(base(), 1, { startTime: '09:00', endTime: '12:00' });
    draft = addRange(draft, 1, { startTime: '14:00', endTime: '17:00' });
    draft = editRange(draft, 1, 0, { endTime: '13:00' });
    expect(draft.week[1]).toEqual([
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
  });

  it('ne touche pas aux autres jours quand on en modifie un', () => {
    const draft = addRange(addRange(base(), 1), 3);
    expect(removeRange(draft, 1, 0).week[3]).toHaveLength(1);
  });

  it('copie une journée sur les cinq jours ouvrés, sans toucher au week-end', () => {
    const draft = copyToWeekdays(addRange(base(), 1, { startTime: '08:00', endTime: '18:00' }), 1);
    for (const weekday of [1, 2, 3, 4, 5]) {
      expect(draft.week[weekday]).toEqual([{ startTime: '08:00', endTime: '18:00' }]);
    }
    expect(draft.week[6]).toEqual([]);
    expect(draft.week[0]).toEqual([]);
  });

  it("copie par VALEUR : éditer un jour n'en modifie pas un autre", () => {
    let draft = copyToWeekdays(addRange(base(), 1), 1);
    draft = editRange(draft, 2, 0, { endTime: '18:00' });
    expect(draft.week[1]?.[0]?.endTime).toBe('12:00');
    expect(draft.week[2]?.[0]?.endTime).toBe('18:00');
  });

  it("vide une journée d'un geste", () => {
    const draft = clearDay(addRange(addRange(base(), 4), 4), 4);
    expect(draft.week[4]).toEqual([]);
  });
});

describe('les exceptions', () => {
  it("ajoute en gardant l'ordre chronologique, puis retire", () => {
    let draft = addException(base(), {
      day: '2026-12-25',
      kind: 'closed',
      startTime: null,
      endTime: null,
      reason: 'Noël',
    });
    draft = addException(draft, {
      day: '2026-07-14',
      kind: 'closed',
      startTime: null,
      endTime: null,
      reason: '14 juillet',
    });
    expect(draft.exceptions.map((e) => e.day)).toEqual(['2026-07-14', '2026-12-25']);
    expect(removeException(draft, 0).exceptions.map((e) => e.day)).toEqual(['2026-12-25']);
  });
});

describe('la politique', () => {
  it('patche un champ sans écraser les autres', () => {
    const draft = withPolicy(base(), { slotMinutes: 45 });
    expect(draft.policy).toEqual({ ...POLICY, slotMinutes: 45 });
  });
});

describe('toPayload', () => {
  it('écarte une plage incohérente au lieu de faire refuser toute la grille', () => {
    let draft = addRange(base(), 1, { startTime: '09:00', endTime: '12:00' });
    draft = addRange(draft, 1, { startTime: '17:00', endTime: '15:00' });
    expect(toPayload(draft).rules).toEqual([{ weekday: 1, startTime: '09:00', endTime: '12:00' }]);
    // …mais l'écran doit pouvoir le DIRE plutôt que de l'avaler en silence.
    expect(hasInvalidRange(draft)).toBe(true);
  });

  it('ne signale rien quand tout est cohérent', () => {
    expect(hasInvalidRange(addRange(base(), 1))).toBe(false);
  });

  it("rend une grille vide quand rien n'est déclaré", () => {
    expect(toPayload(base()).rules).toEqual([]);
  });
});

describe('gridPayload', () => {
  const persisted: AvailabilityConfigView = {
    rules: [],
    exceptions: [
      {
        id: 'avexc_1',
        day: '2026-12-25',
        kind: 'closed',
        startTime: null,
        endTime: null,
        reason: 'Noël',
      },
    ],
    policy: { ...POLICY, slotMinutes: 60 },
  };

  it('envoie les règles du BROUILLON', () => {
    const draft = addRange(base(), 1, { startTime: '09:00', endTime: '12:00' });
    expect(gridPayload(draft, persisted).rules).toEqual([
      { weekday: 1, startTime: '09:00', endTime: '12:00' },
    ]);
  });

  it("n'emporte PAS des exceptions ni une politique éditées ailleurs sans être enregistrées", () => {
    // Les deux tranches ont leur propre bouton : ce qui part ici est ce que le
    // serveur détient déjà, jamais un édit que personne n'a validé.
    let draft = addException(base(), {
      day: '2027-01-02',
      kind: 'closed',
      startTime: null,
      endTime: null,
      reason: 'Congés jamais enregistrés',
    });
    draft = withPolicy(draft, { slotMinutes: 15 });

    const payload = gridPayload(draft, persisted);
    expect(payload.exceptions).toEqual([
      { day: '2026-12-25', kind: 'closed', startTime: null, endTime: null, reason: 'Noël' },
    ]);
    expect(payload.policy.slotMinutes).toBe(60);
  });
});
