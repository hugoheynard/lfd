import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les phrases du commerce** (plan des phrases du journal, lot D,
 * 2026-09-19) : le catalogue professionnel, les prospects, les rendez-vous et
 * le cockpit — forme courante et formes d'avant.
 */

function on(
  subjectType: string,
  type: string,
  payload: Record<string, unknown>,
  subjectId = 'sujet_1',
): FactInput {
  return {
    type,
    payload,
    subjectType,
    subjectId,
    actorName: 'Colette Martin',
    actorType: 'staff',
  };
}

const item = (type: string, payload: Record<string, unknown>) =>
  on('catalog_item', type, payload, 'TAR-001');

/** Les montants se forment avec des espaces insécables : on les lit comme des espaces. */
function spaced(said: string): string {
  return said.replace(/[\u00a0\u202f]/gu, ' ');
}

function sentence(input: FactInput): string {
  return spaced(renderFact(input).sentence);
}

describe('le catalogue professionnel', () => {
  it('dit l’ancien et le nouveau prix, le SKU à côté du nom', () => {
    const rendered = renderFact(
      item('catalog_item.b2b_price_set', {
        subjectLabel: 'Tarte citron',
        sku: 'TAR-001',
        before: { priceMillicents: 818_182 },
        after: { priceMillicents: 900_000 },
      }),
    );

    expect(spaced(rendered.sentence)).toBe(
      'Colette Martin a fixé le prix professionnel de « Tarte citron » (TAR-001) de 8,18182 € HT à 9,00 € HT',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('dit un premier prix sans « avant », et un article sans nom par son SKU', () => {
    expect(
      sentence(
        item('catalog_item.b2b_price_set', {
          sku: 'TAR-001',
          before: null,
          after: { priceMillicents: 900_000 },
        }),
      ),
    ).toBe('Colette Martin a fixé le prix professionnel de l’article TAR-001 à 9,00 € HT');
  });

  it('dit le prix retiré', () => {
    expect(
      sentence(
        item('catalog_item.b2b_price_cleared', {
          subjectLabel: 'Tarte citron',
          sku: 'TAR-001',
          before: { priceMillicents: 900_000 },
        }),
      ),
    ).toBe(
      'Colette Martin a retiré le prix professionnel de « Tarte citron » (TAR-001), qui était de 9,00 € HT',
    );
  });

  it.each([
    ['catalog_item.hidden', 'a masqué « Tarte citron » (TAR-001) du catalogue professionnel'],
    ['catalog_item.shown', 'a remis « Tarte citron » (TAR-001) au catalogue professionnel'],
    [
      'catalog_item.featured',
      'a mis en avant « Tarte citron » (TAR-001) dans le catalogue professionnel',
    ],
    ['catalog_item.unfeatured', 'a cessé de mettre en avant « Tarte citron » (TAR-001)'],
  ])('dit la vitrine : %s', (type, said) => {
    expect(sentence(item(type, { subjectLabel: 'Tarte citron', sku: 'TAR-001' }))).toBe(
      `Colette Martin ${said}`,
    );
  });

  it('lit la forme d’avant le lot B, sans nom', () => {
    expect(sentence(item('catalog_item.hidden', { sku: 'TAR-001' }))).toBe(
      'Colette Martin a masqué l’article TAR-001 du catalogue professionnel',
    );
  });

  it('dit les articles écartés d’une arrivée, et laisse ses identifiants au détail', () => {
    const accepted = renderFact(
      on('catalog_delivery', 'catalog_delivery.accepted', {
        deliveryId: 'cd_1',
        revisionId: 'rev_1',
        versionId: 'ver_1',
        excludedSkus: ['TAR-001', 'TAR-002'],
      }),
    );
    const none = on('catalog_delivery', 'catalog_delivery.accepted', {
      deliveryId: 'cd_1',
      revisionId: 'rev_1',
      versionId: 'ver_1',
      excludedSkus: [],
    });

    expect(accepted.sentence).toBe(
      'Colette Martin a accepté une arrivée du référentiel, en écartant 2 articles : TAR-001, TAR-002',
    );
    expect(accepted.detail.map((row) => row.label)).toEqual([
      'Arrivée du référentiel',
      'Révision',
      'Version',
    ]);
    expect(sentence(none)).toBe(
      'Colette Martin a accepté une arrivée du référentiel, sans écarter d’article',
    );
  });

  it('compte les articles écartés quand ils sont nombreux, et en laisse la liste au détail', () => {
    const many = renderFact(
      on('catalog_delivery', 'catalog_delivery.accepted', {
        deliveryId: 'cd_1',
        revisionId: 'rev_1',
        versionId: 'ver_1',
        excludedSkus: ['A', 'B', 'C', 'D', 'E', 'F'],
      }),
    );

    expect(many.sentence).toBe(
      'Colette Martin a accepté une arrivée du référentiel, en écartant 6 articles',
    );
    expect(many.detail.map((row) => row.label)).toContain('Articles écartés');
  });
});

describe('les prospects', () => {
  const lead = (type: string, payload: Record<string, unknown>) => on('lead', type, payload);

  it('dit le prospect saisi — l’adresse d’une ligne ancienne reste au détail', () => {
    expect(
      sentence(
        lead('lead.captured', { subjectLabel: 'Café des Halles', businessName: 'Café des Halles' }),
      ),
    ).toBe('Colette Martin a saisi le prospect « Café des Halles »');
    const old = renderFact(
      lead('lead.captured', { businessName: 'Café des Halles', email: 'contact@cafe.fr' }),
    );
    expect(old.sentence).toBe('Colette Martin a saisi le prospect « Café des Halles »');
    expect(old.detail).toEqual([{ label: 'Adresse e-mail', value: 'contact@cafe.fr' }]);
  });

  it('dit l’étape, et tourne sans le nom sur une ligne ancienne', () => {
    expect(
      sentence(
        lead('lead.stage_changed', { subjectLabel: 'Café des Halles', status: 'negotiating' }),
      ),
    ).toBe('Colette Martin a passé le prospect « Café des Halles » à l’étape « En négociation »');
    expect(sentence(lead('lead.stage_changed', { status: 'qualified' }))).toBe(
      'Colette Martin a passé un prospect à l’étape « Qualifié »',
    );
  });

  it('dit la conversion à la main, et le rapprochement à l’inscription au passif', () => {
    expect(
      sentence(lead('lead.converted', { subjectLabel: 'Café des Halles', via: 'manual' })),
    ).toBe('Colette Martin a converti le prospect « Café des Halles » en client');
    const linked = renderFact(
      lead('lead.converted', { via: 'registration', linkedUserId: 'usr_1' }),
    );
    expect(linked.sentence).toBe(
      'Un prospect a été rapproché d’une personne à son inscription (identifiant usr_1)',
    );
    expect(linked.namesActor).toBe(false);
  });

  it('dit le prospect perdu', () => {
    expect(sentence(lead('lead.lost', { subjectLabel: 'Café des Halles' }))).toBe(
      'Colette Martin a classé le prospect « Café des Halles » comme perdu',
    );
  });
});

describe('les rendez-vous', () => {
  const START = '2026-09-19T08:00:00.000Z';
  const onCompany = (type: string, payload: Record<string, unknown>) =>
    on('company', type, payload, 'co_1');

  it('dit la demande, sa date et son canal, avec qui', () => {
    const rendered = renderFact(
      onCompany('appointment.requested', {
        subjectLabel: 'Café des Halles',
        appointmentId: 'apt_1',
        startAt: START,
        channel: 'visio',
      }),
    );

    expect(rendered.sentence).toMatch(
      /^Colette Martin a demandé un rendez-vous pour le 19 septembre 2026 à \d\d:00 \(visio\), avec le client « Café des Halles »$/u,
    );
    expect(rendered.detail.map((row) => row.label)).toEqual(['Rendez-vous']);
  });

  it('dit la confirmation, sur une ligne ancienne sans nom', () => {
    expect(
      sentence(
        on('user', 'appointment.confirmed', {
          appointmentId: 'apt_1',
          startAt: START,
          via: 'staff',
        }),
      ),
    ).toMatch(/^Colette Martin a confirmé le rendez-vous du 19 septembre 2026 à \d\d:00$/u);
  });

  it('dit l’annulation, avec le motif de l’équipe', () => {
    expect(
      sentence(
        onCompany('appointment.cancelled', {
          subjectLabel: 'Café des Halles',
          appointmentId: 'apt_1',
          reason: 'Fermeture exceptionnelle',
          via: 'staff',
        }),
      ),
    ).toBe(
      'Colette Martin a annulé le rendez-vous avec le client « Café des Halles » (motif : Fermeture exceptionnelle)',
    );
    expect(
      sentence(
        on('user', 'appointment.cancelled', {
          subjectLabel: 'Jean Dupont',
          appointmentId: 'apt_1',
          via: 'customer',
        }),
      ),
    ).toBe('Colette Martin a annulé le rendez-vous avec Jean Dupont');
  });

  it('dit le rendez-vous tenu ou manqué ; le motif vide d’avant se tait', () => {
    const honored = renderFact(
      onCompany('appointment.honored', { appointmentId: 'apt_1', reason: '', via: 'staff' }),
    );

    expect(honored.sentence).toBe('Colette Martin a noté que le rendez-vous a bien eu lieu');
    expect(honored.detail.map((row) => row.label)).toEqual(['Rendez-vous']);
    expect(
      sentence(
        onCompany('appointment.no_show', {
          subjectLabel: 'Café des Halles',
          appointmentId: 'apt_1',
          via: 'staff',
        }),
      ),
    ).toBe(
      'Colette Martin a noté que le rendez-vous avec le client « Café des Halles » n’a pas été honoré',
    );
  });
});

describe('le cockpit', () => {
  it('dit la recommandation au passif, sans lui inventer d’agent', () => {
    const rendered = renderFact(
      on('lead', 'reco.shown', { subjectLabel: 'Café des Halles', play: 'win_back', score: 80 }),
    );

    expect(rendered.sentence).toBe(
      'Coup « Reconquête » recommandé pour le prospect « Café des Halles » (score : 80 sur 100)',
    );
    expect(rendered.namesActor).toBe(false);
    expect(sentence(on('user', 'reco.shown', { play: 'nurture', score: 12 }))).toBe(
      'Coup « Démarchage » recommandé (score : 12 sur 100)',
    );
  });
});
