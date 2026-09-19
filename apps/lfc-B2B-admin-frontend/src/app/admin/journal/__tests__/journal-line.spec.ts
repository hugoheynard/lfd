import type { ActivityEventView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { toLine } from '../journal-line';

function event(overrides: Partial<ActivityEventView>): ActivityEventView {
  return {
    id: '01J',
    type: 'vat_rate.rate_changed',
    module: 'pim',
    occurredAt: '2026-08-21T10:00:00.000Z',
    subjectType: 'vat_rate',
    subjectId: 'tva_1',
    actorType: 'staff',
    actorId: 'auth0|x',
    actorName: 'Hugo Heynard',
    actorRole: 'Commercial',
    traceId: 'trace',
    payload: {},
    ...overrides,
  };
}

describe('toLine', () => {
  it('raconte un changement de taux, et rend la portée telle qu’elle a été figée', () => {
    const line = toLine(
      event({
        payload: {
          subjectLabel: 'Réduit',
          name: 'Réduit',
          from: 5.5,
          to: 10,
          blast: { families: { takeaway: 12, eatIn: 3, b2b: 2 } },
        },
      }),
    );

    expect(line.sentence).toBe('Taux de « Réduit » passé de 5,5 % à 10 %');
    expect(line.blast).toBe('touche 12 familles à emporter, 3 sur place, 2 B2B');
    expect(line.actor).toBe('Hugo Heynard (Commercial)');
  });

  /**
   * Régression : la méta lisait `familiesEmporter` / `familiesSurPlace`, que le
   * référentiel n'écrit plus depuis le 2026-08-24 (`5d526662`) — la portée
   * d'un fait avait disparu de la ligne (relevé au lot C, 2026-09-19).
   */
  it('lit la portée sous la forme que le catalogue écrit : familles par contexte, articles', () => {
    const line = toLine(
      event({
        type: 'catalog_revision.pushed',
        subjectType: 'catalog_revision',
        payload: {
          subjectLabel: 'Rentrée',
          reference: 'R-7WT4NA',
          channel: 'b2b',
          mode: 'live',
          candidates: 40,
          excluded: 0,
          blast: { articles: 40 },
        },
      }),
    );

    expect(line.blast).toBe('touche 40 articles');
    // La méta la dit : le détail ne la répète pas.
    expect(
      line.detail.map((row) => row.label).filter((label) => label.startsWith('Portée')),
    ).toEqual([]);
  });

  it('lit encore les lignes d’août, écrites sous l’ancienne forme et les anciennes clés', () => {
    // Du 2026-08-21 au 2026-08-24, trois champs nommés ; jusqu'au 2026-08-26,
    // les clés de contexte `emporter` / `surPlace` — jamais réécrites.
    const named = toLine(
      event({ payload: { blast: { familiesEmporter: 3, familiesSurPlace: 1, familiesB2b: 0 } } }),
    );
    const keyed = toLine(event({ payload: { blast: { families: { emporter: 1, surPlace: 2 } } } }));

    expect(named.blast).toBe('touche 3 familles à emporter, 1 sur place, 0 B2B');
    expect(keyed.blast).toBe('touche 1 famille à emporter, 2 sur place');
  });

  it('garde sous sa clé un contexte créé à l’écran, que le dictionnaire ne connaît pas', () => {
    const line = toLine(event({ payload: { blast: { families: { brunch: 2 } } } }));

    expect(line.blast).toBe('touche 2 familles brunch');
  });

  it('ne rend pas de portée quand le fait n’en avait pas', () => {
    // Une portée absente n'est pas un zéro : c'est un fait sans aval.
    const line = toLine(event({ type: 'vat_rate.renamed', payload: { from: 'A', to: 'B' } }));

    expect(line.sentence).toBe('Taux « A » renommé « B »');
    expect(line.blast).toBe('');
  });

  it('garde un zéro figé, qui est un compte', () => {
    const line = toLine(event({ type: 'product.published', payload: { blast: { variants: 0 } } }));

    expect(line.blast).toBe('touche 0 article');
  });

  it('rend la NATURE de l’acteur quand l’annuaire ne le connaissait pas', () => {
    // Jamais l'identifiant technique au milieu d'une phrase.
    const line = toLine(event({ actorName: null, actorRole: null }));

    expect(line.actor).toBe('un membre de l’équipe');
  });

  /** Le module de la comptabilité (Hugo, 2026-09-19) : un libellé, pas la clé brute. */
  it('nomme le module de la comptabilité', () => {
    const line = toLine(event({ type: 'payment_mandate.signed', module: 'comptabilite' }));

    expect(line.moduleLabel).toBe('Comptabilité');
  });

  /**
   * Régression : un type sans phrase s'affichait sous son seul code
   * (`product.identity_saved` nu à l'écran) — plan des phrases, exigence 1.
   * Le repli dit ce qu'il sait sans inventer ; le type reste dans la méta.
   */
  it('ne rend jamais le type brut pour un fait qu’il ne connaît pas encore', () => {
    const line = toLine(event({ type: 'commande.avenant_signe', payload: { motif: 'Remise' } }));

    expect(line.sentence).toBe('Fait enregistré sur le taux de TVA');
    expect(line.sentence).not.toContain('commande.avenant_signe');
    expect(line.detail).toEqual([{ label: 'motif', value: 'Remise' }]);
  });

  it('range sous la phrase tout ce qu’elle n’a pas dit, et pas le client déjà en méta', () => {
    const line = toLine(
      event({
        type: 'order.placed',
        module: 'commandes',
        subjectType: 'user',
        payload: {
          subjectLabel: 'Jean Dupont',
          orderId: 'ord_9',
          orderNumber: 'ORD-142',
          companyId: 'co_1',
          clientName: 'Boulangerie Martin',
          clientLegalName: 'SARL MARTIN',
          totalCents: 1_250,
        },
      }),
    );

    expect(line.sentence).toBe('Commande ORD-142 passée — Jean Dupont');
    expect(line.detail.map((row) => row.label)).toEqual(['Commande', 'Client', 'Total']);
  });
});

describe('toLine — une commande, telle qu’un humain la lit', () => {
  it('nomme la commande par son NUMÉRO, et le client tel qu’il a été figé', () => {
    const line = toLine(
      event({
        type: 'order.placed',
        module: 'commandes',
        occurredAt: '2026-08-21T12:32:00.000Z',
        payload: {
          orderId: 'order_9',
          orderNumber: 'ORD-142',
          clientName: 'Boulangerie Martin',
          clientLegalName: 'SARL MARTIN',
        },
      }),
    );

    expect(line.sentence).toBe('Commande ORD-142 passée');
    expect(line.forWhom).toBe('Boulangerie Martin (SARL MARTIN)');
    expect(line.actor).toBe('Hugo Heynard (Commercial)');
    // Une date lisible, pas l'ISO brut.
    expect(line.when).not.toContain('T');
    expect(line.when).toContain('2026');
  });

  it('ne répète pas la raison sociale quand elle vaut l’enseigne', () => {
    const line = toLine(
      event({
        type: 'order.placed',
        payload: {
          orderNumber: 'ORD-1',
          clientName: 'SARL MARTIN',
          clientLegalName: 'SARL MARTIN',
        },
      }),
    );

    expect(line.forWhom).toBe('SARL MARTIN');
  });

  it('n’affiche pas de client quand le fait n’en avait pas', () => {
    // Commande zéro-friction personnelle : pas de société, et on ne prétend pas
    // le contraire.
    const line = toLine(event({ type: 'order.placed', payload: { orderNumber: 'ORD-2' } }));

    expect(line.forWhom).toBe('');
  });
});

describe('toLine — les notes du commercial', () => {
  // Le geste se dit par le dictionnaire des valeurs depuis le lot D des
  // phrases (2026-09-19), l'auteur en sujet.
  const NOTES = 'Hugo Heynard a modifié les notes du commercial d’un client';

  it.each([
    ['note_added', `${NOTES} : note ajoutée`],
    ['note_revised', `${NOTES} : note modifiée`],
    ['note_removed', `${NOTES} : note supprimée définitivement`],
    ['notes_reordered', `${NOTES} : notes reclassées`],
  ])('nomme le geste « %s »', (action, sentence) => {
    const line = toLine(
      event({
        type: 'company.client_note_edited_by_staff',
        payload: { companyId: 'co_1', noteId: 'note_1', action },
      }),
    );

    expect(line.sentence).toBe(sentence);
  });

  it('ne lit aucun contenu de note, même si une charge en portait', () => {
    // Le fait n'en porte pas (D6) ; si un jour il en portait, l'écran ne le montrerait pas.
    const line = toLine(
      event({
        type: 'company.client_note_edited_by_staff',
        payload: { action: 'note_added', title: 'Rendez-vous secret', body: 'Remise de 30 %' },
      }),
    );

    expect(line.sentence).toBe(`${NOTES} : note ajoutée`);
  });

  it('une action inconnue reste une phrase, pas un type brut', () => {
    const line = toLine(
      event({ type: 'company.client_note_edited_by_staff', payload: { action: 'note_archived' } }),
    );

    expect(line.sentence).toBe(NOTES);
  });
});
