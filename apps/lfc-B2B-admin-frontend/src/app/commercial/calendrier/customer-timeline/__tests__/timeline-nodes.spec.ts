import type { CustomerTimelineEntry } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { nodesOf, timelineRows } from '../timeline-nodes';

function entry(type: string, actorType = 'customer'): CustomerTimelineEntry {
  return {
    id: `evt-${type}`,
    type,
    occurredAt: '2026-08-09T12:00:00.000Z',
    actorType,
    outcome: null,
  };
}

describe('timelineNodes', () => {
  it('met les types connus en mots, avec leur icône', () => {
    const [row] = timelineRows([entry('order.placed')]);
    expect(row?.title).toBe('Commande passée');
    expect(row?.icon).toBe('contracts');
  });

  it('sépare QUI a agi du fait lui-même — deux niveaux de lecture', () => {
    expect(timelineRows([entry('appointment.cancelled', 'staff')])[0]?.actor).toBe('Équipe');
    expect(timelineRows([entry('order.placed', 'customer')])[0]?.actor).toBe('Client');
  });

  it('NE MASQUE PAS un type inconnu : une trace non nommée reste une trace', () => {
    // La cacher ferait mentir la chronologie, qui est ce qu'on vient y chercher.
    const [row] = timelineRows([entry('quelque.chose.de.neuf')]);
    expect(row?.title).toBe('quelque.chose.de.neuf');
    expect(row?.icon).toBe('clock');
  });

  it('garde l’ordre reçu — le serveur a déjà trié', () => {
    const nodes = timelineRows([entry('order.placed'), entry('company.declared')]);
    expect(nodes.map((n) => n.key)).toEqual(['evt-order.placed', 'evt-company.declared']);
  });

  it('dit ce que le rendez-vous a PRODUIT — la lecture commerciale', () => {
    const honored: CustomerTimelineEntry = {
      ...entry('appointment.honored', 'staff'),
      outcome: { type: 'company.activated', days: 3 },
    };
    expect(timelineRows([honored])[0]?.outcome).toBe('compte activé 3 j après');
  });

  it('écrit « le jour même » plutôt que « 0 j après »', () => {
    const honored: CustomerTimelineEntry = {
      ...entry('appointment.honored'),
      outcome: { type: 'order.placed', days: 0 },
    };
    expect(timelineRows([honored])[0]?.outcome).toBe('commande passée le jour même');
  });

  it('convertit l’instant ISO en date', () => {
    expect(timelineRows([entry('order.placed')])[0]?.date).toEqual(
      new Date('2026-08-09T12:00:00.000Z'),
    );
  });

  it('ne met que LE FAIT dans le libellé fold — le détail est rendu à part', () => {
    // C'est ce qui rend la frise lisible : un fait par ligne, le reste dessous.
    expect(nodesOf(timelineRows([entry('order.placed', 'staff')]))[0]?.label).toBe(
      'Commande passée',
    );
  });
});
