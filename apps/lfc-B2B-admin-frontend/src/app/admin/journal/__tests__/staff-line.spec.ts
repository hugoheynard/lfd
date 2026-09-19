import type { ActivityEventView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { toLine } from '../journal-line';

const CECILE = { firstName: 'Cécile', lastName: 'Martin' };

function event(type: string, payload: Record<string, unknown>): ActivityEventView {
  return {
    id: '01J',
    type,
    module: 'equipe',
    occurredAt: '2026-09-18T12:32:00.000Z',
    subjectType: type.startsWith('staff_role.') ? 'staff_role' : 'staff_user',
    subjectId: 'subject_1',
    actorType: 'staff',
    actorId: 'auth0|hugo',
    actorName: 'Hugo Heynard',
    actorRole: 'Administrateur',
    traceId: 'trace',
    payload,
  };
}

describe('toLine — les faits de l’équipe, en phrases', () => {
  it.each<[string, Record<string, unknown>, string, string]>([
    [
      'staff_user.created',
      { person: CECILE, roleLabel: 'Commercial' },
      'Création d’un membre de l’équipe',
      'Hugo Heynard a créé Cécile Martin, Commercial',
    ],
    [
      'staff_user.invited',
      { person: CECILE, kind: 'invitation' },
      'Invitation',
      'Hugo Heynard a invité Cécile Martin à rejoindre le back-office',
    ],
    [
      'staff_user.invited',
      { person: CECILE, kind: 'password_reset' },
      'Nouveau mot de passe',
      'Hugo Heynard a envoyé à Cécile Martin un lien pour choisir un nouveau mot de passe',
    ],
    [
      'staff_user.password_link_issued',
      { person: CECILE },
      'Lien remis à la main',
      'Hugo Heynard a fabriqué un lien d’accès pour Cécile Martin, à lui remettre en personne',
    ],
    [
      'staff_user.identity_edited',
      { person: CECILE, previous: null, fields: ['téléphone', 'fonction'] },
      'Fiche modifiée',
      'Hugo Heynard a modifié la fiche de Cécile Martin : téléphone, fonction',
    ],
    [
      'staff_user.role_changed',
      { person: CECILE, fromLabel: 'Commercial', toLabel: 'Comptabilité' },
      'Changement de rôle',
      'Hugo Heynard a fait passer Cécile Martin de Commercial à Comptabilité',
    ],
    [
      'staff_user.overrides_changed',
      {
        person: CECILE,
        added: [
          { resource: 'pricing', resourceLabel: 'Tarification', action: 'write', effect: 'allow' },
        ],
        changed: [
          { resource: 'leads', resourceLabel: 'Prospects', action: 'read', effect: 'deny' },
        ],
        removed: [
          { resource: 'alerts', resourceLabel: 'Alertes', action: 'read', effect: 'allow' },
        ],
      },
      'Droits individuels',
      'Hugo Heynard a changé les droits individuels de Cécile Martin — accordé : Tarification (écriture) — refusé : Prospects (lecture) — rendu au rôle : Alertes (lecture)',
    ],
    [
      'staff_user.suspended',
      { person: CECILE },
      'Accès suspendu',
      'Hugo Heynard a suspendu l’accès de Cécile Martin',
    ],
    [
      'staff_user.activated',
      { subjectLabel: 'Cécile Martin', person: CECILE },
      'Accès activé',
      'Hugo Heynard a activé l’accès de Cécile Martin',
    ],
    // Les lignes d'avant le 2026-09-19 couvrent aussi la première activation (D7).
    [
      'staff_user.reinstated',
      { person: CECILE },
      'Accès activé ou rétabli',
      'Hugo Heynard a activé ou rétabli l’accès de Cécile Martin',
    ],
    [
      'staff_user.deleted',
      { person: CECILE, roleLabel: 'Commercial' },
      'Suppression d’un membre',
      'Hugo Heynard a supprimé la fiche de Cécile Martin (Commercial)',
    ],
    [
      'staff_role.created',
      { label: 'Logistique', grants: [] },
      'Nouveau rôle',
      'Hugo Heynard a créé le rôle Logistique',
    ],
    [
      'staff_role.updated',
      {
        label: 'Commercial',
        previousLabel: null,
        added: [{ resource: 'alerts', resourceLabel: 'Alertes', action: 'write' }],
        removed: [],
        changed: [],
      },
      'Rôle modifié',
      'Hugo Heynard a modifié le rôle Commercial : + Alertes (écriture)',
    ],
    [
      'staff_role.archived',
      { label: 'Logistique' },
      'Rôle archivé',
      'Hugo Heynard a archivé le rôle Logistique',
    ],
    [
      'staff_role.restored',
      { label: 'Logistique' },
      'Rôle restauré',
      'Hugo Heynard a restauré le rôle Logistique',
    ],
  ])('%s — %s', (type, payload, title, sentence) => {
    const line = toLine(event(type, payload));

    expect(line.title).toBe(title);
    expect(line.sentence).toBe(sentence);
    // La phrase nomme l'auteur : la méta ne le répète pas.
    expect(line.sentenceNamesActor).toBe(true);
  });

  it('dit « Un membre de l’équipe » quand le nom de l’auteur n’a pas été figé', () => {
    // Jamais le `sub` ni l'id de sa fiche au milieu d'une phrase.
    const line = toLine({
      ...event('staff_user.created', { person: CECILE, roleLabel: 'Commercial' }),
      actorName: null,
      actorRole: null,
    });

    expect(line.sentence).toBe('Un membre de l’équipe a créé Cécile Martin, Commercial');
    expect(line.sentence).not.toContain('auth0');
  });

  it('dit « Le système » quand l’auteur sans nom est le système', () => {
    // Plan « reprise du journal », D5 : la racine est créée par le système, et
    // se lisait « Un membre de l’équipe » faute de regarder `actorType`.
    const line = toLine({
      ...event('staff_user.created', {
        person: { firstName: 'Admin', lastName: 'La Folie Coffee' },
        roleLabel: 'Administrateur',
      }),
      actorType: 'system',
      actorId: null,
      actorName: null,
      actorRole: null,
    });

    expect(line.sentence).toBe('Le système a créé Admin La Folie Coffee, Administrateur');
  });

  it('dit « Un client » quand l’auteur sans nom est un client', () => {
    const line = toLine({
      ...event('staff_user.suspended', { person: CECILE }),
      actorType: 'customer',
      actorName: null,
    });

    expect(line.sentence).toBe('Un client a suspendu l’accès de Cécile Martin');
  });

  it('marque « (reprise) » une ligne reprise après coup, invitation comprise', () => {
    const line = toLine({
      ...event('staff_user.invited', {
        person: CECILE,
        kind: 'invitation',
        backfilled: true,
        source: 'reprise attestée par Hugo le 2026-09-18',
      }),
      actorId: null,
      actorName: 'Admin La Folie Coffee',
    });

    expect(line.title).toBe('Invitation');
    expect(line.sentence).toBe(
      'Admin La Folie Coffee a invité Cécile Martin à rejoindre le back-office (reprise)',
    );
  });

  it('ne marque pas une ligne vécue, ni un `backfilled` qui n’est pas `true`', () => {
    const lived = toLine(event('staff_user.created', { person: CECILE, roleLabel: 'Commercial' }));
    const malformed = toLine(
      event('staff_user.created', { person: CECILE, roleLabel: 'Commercial', backfilled: 'true' }),
    );

    expect(lived.sentence).toBe('Hugo Heynard a créé Cécile Martin, Commercial');
    expect(malformed.sentence).not.toContain('(reprise)');
  });

  it('rappelle l’ancien nom quand l’identité a changé de nom', () => {
    const line = toLine(
      event('staff_user.identity_edited', {
        person: CECILE,
        previous: { firstName: 'Cécile', lastName: 'Dupont' },
        fields: ['nom'],
      }),
    );

    expect(line.sentence).toBe(
      'Hugo Heynard a modifié la fiche de Cécile Martin (anciennement Cécile Dupont) : nom',
    );
  });

  it('dit l’avant et l’après de chaque champ modifié, et nomme une valeur vide', () => {
    const line = toLine(
      event('staff_user.identity_edited', {
        person: CECILE,
        previous: null,
        fields: ['téléphone', 'fonction'],
        changes: [
          { field: 'phone', label: 'téléphone', from: '06 11 22 33 44', to: '07 55 66 77 88' },
          { field: 'jobTitle', label: 'fonction', from: '', to: 'Vendeuse' },
        ],
      }),
    );

    expect(line.sentence).toBe(
      'Hugo Heynard a modifié la fiche de Cécile Martin : téléphone 06 11 22 33 44 → 07 55 66 77 88 ; fonction (vide) → Vendeuse',
    );
  });

  it('ne rappelle pas l’ancien nom quand l’avant/après le dit déjà', () => {
    const line = toLine(
      event('staff_user.identity_edited', {
        person: CECILE,
        previous: { firstName: 'Cécile', lastName: 'Dupont' },
        fields: ['nom'],
        changes: [{ field: 'lastName', label: 'nom', from: 'Dupont', to: 'Martin' }],
      }),
    );

    expect(line.sentence).toBe(
      'Hugo Heynard a modifié la fiche de Cécile Martin : nom Dupont → Martin',
    );
  });

  it('dit « (vide) » d’une valeur effacée ou mal formée, et tait une entrée sans libellé', () => {
    const line = toLine(
      event('staff_user.identity_edited', {
        person: CECILE,
        changes: [
          { field: 'phone', label: 'téléphone', from: '06 11 22 33 44', to: '   ' },
          { field: 'email', from: 'a@x.fr', to: 'b@x.fr' },
          { field: 'jobTitle', label: 'fonction', from: 42, to: null },
          'pas un objet',
        ],
      }),
    );

    expect(line.sentence).toBe(
      'Hugo Heynard a modifié la fiche de Cécile Martin : téléphone 06 11 22 33 44 → (vide) ; fonction (vide) → (vide)',
    );
  });

  it('retombe sur la liste des champs quand `changes` est vide ou illisible', () => {
    const line = toLine(
      event('staff_user.identity_edited', {
        person: CECILE,
        fields: ['téléphone'],
        changes: 'illisible',
      }),
    );

    expect(line.sentence).toBe('Hugo Heynard a modifié la fiche de Cécile Martin : téléphone');
  });

  it('rappelle l’ancien libellé d’un rôle renommé, et dit une action changée', () => {
    const line = toLine(
      event('staff_role.updated', {
        label: 'Ventes',
        previousLabel: 'Commercial',
        added: [],
        removed: [{ resource: 'leads', resourceLabel: 'Prospects', action: 'read' }],
        changed: [{ resource: 'pricing', resourceLabel: 'Tarification', action: 'write' }],
      }),
    );

    expect(line.sentence).toBe(
      'Hugo Heynard a modifié le rôle Ventes (anciennement Commercial) : − Prospects (lecture), Tarification → écriture',
    );
  });

  it('lit une charge utile incomplète sans casser ni afficher d’identifiant', () => {
    // Du JSON non typé : une personne absente rend `—`, un rôle absent disparaît.
    const line = toLine(event('staff_user.created', { person: 'cecile@x.fr' }));

    expect(line.sentence).toBe('Hugo Heynard a créé —');
  });

  // Une recommandation que le cockpit a affichée : l'auteur de la ligne n'a
  // pas fait ce geste, la phrase reste au passif et la méta dit « par … ».
  it('garde « par … » dans la méta pour un fait qui n’est pas de l’équipe', () => {
    const line = toLine({
      ...event('reco.shown', { play: 'nurture', score: 12 }),
      module: 'commercial',
      subjectType: 'user',
    });

    expect(line.title).toBe('');
    expect(line.sentence).toBe('Coup « Démarchage » recommandé (score : 12 sur 100)');
    expect(line.sentenceNamesActor).toBe(false);
  });
});

describe('toLine — le badge de module', () => {
  it.each([
    ['equipe', 'Équipe'],
    ['comptes', 'Comptes clients'],
    ['pim', 'Référentiel'],
    ['commercial', 'Commercial'],
    ['commandes', 'Commandes'],
  ] as const)('affiche « %s » sous son libellé « %s », pas sa clé', (module, label) => {
    const line = toLine({ ...event('staff_user.suspended', { person: CECILE }), module });

    expect(line.moduleLabel).toBe(label);
  });

  it('n’affiche pas de badge pour un fait sans module', () => {
    const line = toLine({ ...event('commande.avenant_signe', {}), module: null });

    expect(line.moduleLabel).toBe('');
  });
});
