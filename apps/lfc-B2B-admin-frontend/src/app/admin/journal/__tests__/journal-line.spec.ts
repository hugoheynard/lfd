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
          name: 'Réduit',
          from: 5.5,
          to: 10,
          blast: { familiesEmporter: 3, familiesSurPlace: 1 },
        },
      }),
    );

    expect(line.sentence).toBe('Taux de « Réduit » passé de 5,5 % à 10 %');
    expect(line.blast).toBe('3 famille(s) à emporter · 1 sur place');
    expect(line.actor).toBe('Hugo Heynard (Commercial)');
  });

  it('ne rend pas de portée quand le fait n’en avait pas', () => {
    // Une portée absente n'est pas un zéro : c'est un fait sans aval.
    const line = toLine(event({ type: 'vat_rate.renamed', payload: { from: 'A', to: 'B' } }));

    expect(line.sentence).toBe('Taux « A » renommé « B »');
    expect(line.blast).toBe('');
  });

  it('garde un zéro figé, qui est un compte', () => {
    const line = toLine(event({ type: 'product.published', payload: { blast: { variants: 0 } } }));

    expect(line.blast).toBe('0 article(s)');
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

  it('rend le type tel quel pour un fait qu’il ne connaît pas encore', () => {
    // Le journal est ouvert : un module peut émettre un type que cet écran
    // ignore. Afficher le type reste vrai ; inventer une phrase, non.
    const line = toLine(event({ type: 'commande.avenant_signe', payload: {} }));

    expect(line.sentence).toBe('commande.avenant_signe');
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
  it.each([
    ['note_added', 'Note du commercial ajoutée'],
    ['note_revised', 'Note du commercial modifiée'],
    ['note_removed', 'Note du commercial supprimée définitivement'],
    ['notes_reordered', 'Notes du commercial reclassées'],
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

    expect(line.sentence).toBe('Note du commercial ajoutée');
  });

  it('une action inconnue reste une phrase, pas un type brut', () => {
    const line = toLine(
      event({ type: 'company.client_note_edited_by_staff', payload: { action: 'note_archived' } }),
    );

    expect(line.sentence).toBe('Notes du commercial modifiées');
  });
});
