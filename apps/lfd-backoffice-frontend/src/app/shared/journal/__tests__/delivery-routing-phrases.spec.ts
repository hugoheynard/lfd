import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/** **Les phrases du calculateur de tournée** (lot 7, L7-C13 et L7-C14). */

function fact(type: string, subjectType: string, payload: Record<string, unknown>): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId: 'x_1',
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

function sentence(input: FactInput): string {
  return renderFact(input).sentence.replace(/\s/gu, ' ');
}

const SETTINGS = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: 'insert',
  multiplePassages: false,
};

describe('le calculateur de tournée (delivery_routing.*, delivery_round.proposal_applied)', () => {
  it('dit les réglages après, et les défauts quand personne n’avait réglé', () => {
    expect(
      sentence(
        fact('delivery_routing.settings_updated', 'delivery_routing', {
          subjectLabel: 'Calcul des tournées',
          before: null,
          after: SETTINGS,
        }),
      ),
    ).toBe(
      'Colette Martin a réglé le calcul des tournées : détour ×1,4, 35 km/h, départ au plus tôt 07:00, 240 min au plus par tournée, 5 min par arrêt, par défaut : insérer dans les tournées existantes, un seul passage par véhicule ; c’étaient les valeurs par défaut',
    );
  });

  it('dit les réglages d’avant quand il y en avait', () => {
    expect(
      sentence(
        fact('delivery_routing.settings_updated', 'delivery_routing', {
          subjectLabel: 'Calcul des tournées',
          before: { ...SETTINGS, detourPercent: 135 },
          after: SETTINGS,
        }),
      ),
    ).toContain('; c’étaient détour ×1,35, 35 km/h');
  });

  it('lit des réglages d’avant les modes sans rien inventer', () => {
    const older = {
      detourPercent: 140,
      averageSpeedKmh: 35,
      earliestDeparture: '07:00',
      maxRoundMinutes: 240,
      stopMinutes: 5,
    };
    expect(
      sentence(
        fact('delivery_routing.settings_updated', 'delivery_routing', {
          before: null,
          after: { ...older, defaultMode: 'new_rounds', multiplePassages: true },
        }),
      ),
    ).toContain('par défaut : nouvelles tournées, plusieurs passages par véhicule');
    expect(
      sentence(
        fact('delivery_routing.settings_updated', 'delivery_routing', {
          before: null,
          after: older,
        }),
      ),
    ).toContain('5 min par arrêt ; c’étaient');
  });

  it('dit le contenant par défaut d’une commande, et son absence (2026-10-06)', () => {
    const container = { binType: { id: 'manne', name: 'Manne' }, count: 2 };
    const said = sentence(
      fact('delivery_routing.settings_updated', 'delivery_routing', {
        before: { ...SETTINGS, defaultContainer: null },
        after: { ...SETTINGS, defaultContainer: container },
      }),
    );

    expect(said).toContain('un seul passage par véhicule, contenant par défaut : 2 × « Manne » ;');
    expect(said).toContain('un seul passage par véhicule, sans contenant par défaut');
  });

  it('dit chaque tournée touchée, ouverte ou recomposée, avant et après', () => {
    expect(
      sentence(
        fact('delivery_round.proposal_applied', 'delivery_day', {
          subjectLabel: '2026-10-01',
          day: '2026-10-01',
          rounds: [
            {
              round: { id: 'r_1', name: 'Kangoo' },
              passage: 1,
              opened: true,
              before: [],
              after: [{ id: 'o_1', name: 'CMD-1' }, 'o_2'],
            },
            {
              round: { id: 'r_2', name: 'Trafic' },
              passage: 2,
              opened: false,
              before: [{ id: 'o_3', name: 'CMD-3' }],
              after: [],
            },
          ],
        }),
      ),
    ).toBe(
      'Colette Martin a appliqué une proposition du calculateur pour le 1 octobre 2026 — la tournée « Kangoo » (ouverte) : « CMD-1 », une commande (identifiant o_2) ; la tournée « Trafic », passage 2 : de « CMD-3 » à —',
    );
  });

  it('lit une charge incomplète sans erreur', () => {
    expect(
      sentence(fact('delivery_round.proposal_applied', 'delivery_day', { day: '2026-10-01' })),
    ).toBe('Colette Martin a appliqué une proposition du calculateur pour le 1 octobre 2026');
  });
});

describe('la décision réglée d’avance à la porte, globale (B3 bis)', () => {
  it('dit la règle après, et « me demander » par défaut quand personne n’avait réglé', () => {
    expect(
      sentence(
        fact('delivery_doorstep.settings_updated', 'delivery_doorstep', {
          subjectLabel: 'Décision à la porte',
          before: null,
          after: 'bring_back',
        }),
      ),
    ).toBe(
      'Colette Martin a réglé la décision à la porte : rapporter ; c’était « me demander », par défaut',
    );
  });

  it('dit la règle d’avant quand il y en avait une', () => {
    expect(
      sentence(
        fact('delivery_doorstep.settings_updated', 'delivery_doorstep', {
          subjectLabel: 'Décision à la porte',
          before: 'deposit',
          after: 'ask',
        }),
      ),
    ).toContain('me demander ; c’était déposer avec photo, même si la signature est exigée');
  });
});
