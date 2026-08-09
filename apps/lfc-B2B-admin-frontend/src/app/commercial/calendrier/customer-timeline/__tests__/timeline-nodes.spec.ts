import type { CustomerTimelineEntry } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { timelineNodes } from '../timeline-nodes';

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
    const [node] = timelineNodes([entry('order.placed')]);
    expect(node?.label).toContain('Commande passée');
    expect(node?.icon).toBe('contracts');
  });

  it('dit QUI a agi — souvent la vraie information', () => {
    expect(timelineNodes([entry('appointment.cancelled', 'staff')])[0]?.label).toContain('Équipe');
    expect(timelineNodes([entry('order.placed', 'customer')])[0]?.label).toContain('Client');
  });

  it('NE MASQUE PAS un type inconnu : une trace non nommée reste une trace', () => {
    // La cacher ferait mentir la chronologie, qui est ce qu'on vient y chercher.
    const [node] = timelineNodes([entry('quelque.chose.de.neuf')]);
    expect(node?.label).toContain('quelque.chose.de.neuf');
    expect(node?.icon).toBe('clock');
  });

  it('garde l’ordre reçu — le serveur a déjà trié', () => {
    const nodes = timelineNodes([entry('order.placed'), entry('company.declared')]);
    expect(nodes.map((n) => n.key)).toEqual(['evt-order.placed', 'evt-company.declared']);
  });

  it('dit ce que le rendez-vous a PRODUIT — la lecture commerciale', () => {
    const honored: CustomerTimelineEntry = {
      ...entry('appointment.honored', 'staff'),
      outcome: { type: 'company.activated', days: 3 },
    };
    expect(timelineNodes([honored])[0]?.label).toContain('compte activé 3 j après');
  });

  it('écrit « le jour même » plutôt que « 0 j après »', () => {
    const honored: CustomerTimelineEntry = {
      ...entry('appointment.honored'),
      outcome: { type: 'order.placed', days: 0 },
    };
    expect(timelineNodes([honored])[0]?.label).toContain('le jour même');
  });

  it('convertit l’instant ISO en date pour le composant fold', () => {
    expect(timelineNodes([entry('order.placed')])[0]?.date).toEqual(
      new Date('2026-08-09T12:00:00.000Z'),
    );
  });
});
