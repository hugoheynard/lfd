import { describe, expect, it } from 'vitest';

import { factDetail, type DetailOfFact } from '../detail-rows';
import { fallbackPhrase } from '../fallback-phrase';
import { plain } from '../phrase';
import { renderFact, type FactInput } from '../render-fact';

/**
 * **Le moteur de phrases** (plan des phrases du journal, lot C) : le repli
 * d'un type sans phrase, le détail d'après le schéma qui valide la charge —
 * forme courante ou ancienne —, les unités, et ce qui ne doit jamais paraître.
 */

function fact(overrides: Partial<FactInput> & Pick<FactInput, 'type'>): FactInput {
  return {
    payload: {},
    subjectType: 'product',
    subjectId: 'prd_42',
    actorName: 'Colette Martin',
    actorType: 'staff',
    ...overrides,
  };
}

function row(rendered: ReturnType<typeof renderFact>, label: string): string | undefined {
  return rendered.detail.find((candidate) => candidate.label === label)?.value;
}

function detailRow(detail: DetailOfFact, label: string): string | undefined {
  return detail.rows.find((candidate) => candidate.label === label)?.value;
}

describe('le repli d’un type sans phrase', () => {
  it('nomme l’auteur et le sujet quand le verbe porte sur le sujet lui-même', () => {
    const rendered = renderFact(
      fact({
        type: 'product_category.created',
        subjectType: 'product_category',
        subjectId: 'cat_1',
        payload: {
          subjectLabel: 'Tartes',
          name: { fr: 'Tartes' },
          parent: null,
        },
      }),
    );

    expect(rendered.sentence).toBe('Colette Martin a créé la famille « Tartes »');
    expect(rendered.namesActor).toBe(true);
    // Le sujet a une fiche : il est lié.
    expect(rendered.segments).toContainEqual({
      kind: 'subject',
      text: 'Tartes',
      route: '/pim/categories/cat_1',
    });
  });

  it('ne prête pas au sujet un geste qui porte sur autre chose', () => {
    // `delivery_address_added` ajoute une ADRESSE : « a ajouté le client » serait faux.
    // Le repli seul : le type a sa phrase depuis le lot D (2026-09-19).
    const said = fallbackPhrase({
      type: 'company.delivery_address_added',
      subjectType: 'company',
      subjectId: 'co_1',
      actor: 'Colette Martin',
      payload: {
        subjectLabel: 'Café des Halles',
        address: { id: 'adr_1', ville: 'Paris', codePostal: '75011' },
      },
    });

    expect(plain(said.segments)).toBe('Fait enregistré sur le client « Café des Halles »');
    expect(said.namesActor).toBe(false);
  });

  it('ne rend jamais le type brut, même hors catalogue, et garde la charge lisible', () => {
    // Régression : `factSentence` rendait `commande.avenant_signe` tel quel.
    const rendered = renderFact(
      fact({ type: 'commande.avenant_signe', subjectType: 'order', payload: { motif: 'Remise' } }),
    );

    expect(rendered.sentence).toBe('Fait enregistré');
    expect(rendered.sentence).not.toContain('commande.avenant_signe');
    expect(rendered.detail).toEqual([{ label: 'motif', value: 'Remise' }]);
  });
});

describe('le détail, d’après le schéma qui valide la charge', () => {
  it('lit une ligne ancienne avec sa forme ancienne : les ids nus se disent comme tels', () => {
    // Avant le lot B, `product.reclassified` ne citait les familles que par leur id (D5).
    const rendered = renderFact(
      fact({ type: 'product.reclassified', payload: { from: 'cat_1', to: 'cat_2' } }),
    );

    expect(row(rendered, 'Avant')).toBe('(identifiant cat_1)');
    expect(row(rendered, 'Après')).toBe('(identifiant cat_2)');
  });

  it('cite les objets sous leur nom du moment, et l’avant → après d’un diff sans son préfixe', () => {
    const rendered = renderFact(
      fact({
        type: 'product.identity_saved',
        payload: {
          subjectLabel: 'Tarte citron',
          changes: {
            name: { from: { fr: 'Tarte' }, to: { fr: 'Tarte citron', en: 'Lemon tart' } },
            categoryId: {
              from: { id: 'cat_1', name: 'Tartes' },
              to: { id: 'cat_2', name: 'Entremets' },
            },
          },
        },
      }),
    );

    expect(row(rendered, 'Nom')).toBe('Tarte → Tarte citron (anglais : Lemon tart)');
    expect(row(rendered, 'Famille')).toBe('Tartes → Entremets');
  });

  it('met chaque unité en forme : millicentimes, points de base, jours, instants, booléens', () => {
    // Le détail seul : la phrase du prix professionnel dit déjà l'avant et
    // l'après (lot D), et c'est leur mise en forme qu'on éprouve ici.
    const price = factDetail(
      'catalog_item.b2b_price_set',
      {
        subjectLabel: 'Croissant',
        sku: 'VIE-001',
        before: null,
        after: { priceMillicents: 818_182 },
      },
      new Set(['subjectLabel']),
    );
    const zone = renderFact(
      fact({
        type: 'delivery_zone.created',
        subjectType: 'delivery_zone',
        payload: { subjectLabel: 'Est', label: 'Est', postalPrefixCount: 12, fee: { bp: 550 } },
      }),
    );
    // Le détail seul, sans phrase : celle de la dérogation dit déjà le client
    // et la journée (lot D), et c'est leur mise en forme qu'on éprouve ici.
    const waiver = factDetail(
      'order_cutoff_waiver.granted',
      {
        company: { id: 'co_1', name: 'Café des Halles' },
        fulfillmentDate: '2026-09-19',
        reason: 'Livraison exceptionnelle',
      },
      new Set(),
    );
    const schedule = renderFact(
      fact({
        type: 'public_pickup_schedule.updated',
        subjectType: 'pickup_address',
        payload: {
          subjectLabel: 'Halles',
          label: 'Halles',
          ruleCount: 2,
          closureCount: 0,
          configured: true,
        },
      }),
    );

    expect(detailRow(price, 'Avant')).toBe('aucun');
    expect(detailRow(price, 'Après › Prix HT')).toMatch(/^8,18182\s€$/u);
    expect(row(zone, 'Frais › Taux')).toBe('5,5 %');
    expect(detailRow(waiver, 'Jour de retrait ou de livraison')).toBe('19 septembre 2026');
    expect(detailRow(waiver, 'Client')).toBe('Café des Halles');
    expect(row(schedule, 'Configuré')).toBe('oui');
  });

  it('rend brute, sans lever, une charge qu’aucune forme n’accepte', () => {
    const rendered = renderFact(
      fact({
        type: 'vat_rate.created',
        payload: { name: 'Réduit', percent: 'cinq', extra: [1, 2] },
      }),
    );

    expect(rendered.sentence).toBe('Colette Martin a créé le taux de TVA « Réduit » à —');
    expect(rendered.detail).toEqual([{ label: 'extra', value: '1, 2' }]);
  });

  it('ne rend aucun contenu de note du commercial, même d’une charge hors schéma', () => {
    // Plan « notes photo du commercial », D6 : une note supprimée ne reste lisible nulle part.
    const rendered = renderFact(
      fact({
        type: 'company.client_note_edited_by_staff',
        subjectType: 'company',
        payload: { action: 'note_added', title: 'Rendez-vous secret', body: 'Remise de 30 %' },
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a modifié les notes du commercial d’un client : note ajoutée',
    );
    expect(rendered.detail).toEqual([]);
  });

  it('ne répète pas au détail ce que la ligne montre ailleurs', () => {
    const rendered = renderFact(
      fact({
        type: 'order.placed',
        subjectType: 'user',
        payload: {
          orderId: 'ord_1',
          orderNumber: 'ORD-142',
          companyId: null,
          clientName: 'Boulangerie Martin',
          totalCents: 1_250,
        },
      }),
      ['clientName'],
    );

    expect(row(rendered, 'Nom du client')).toBeUndefined();
    expect(row(rendered, 'Total')).toMatch(/^12,50\s€$/u);
  });
});

describe('le sujet de la ligne', () => {
  it('s’ajoute en gras quand la phrase ne l’a pas nommé', () => {
    const rendered = renderFact(
      fact({
        type: 'order.ready',
        subjectType: 'user',
        subjectId: 'usr_1',
        payload: {
          subjectLabel: 'Jean Dupont',
          orderId: 'ord_1',
          orderNumber: 'ORD-1',
          readyBy: { id: 'stf_1', name: 'Cécile Martin' },
          readyAt: '2026-09-19T08:00:00.000Z',
        },
      }),
    );

    expect(rendered.sentence).toBe('Cécile Martin a déclaré la commande ORD-1 prête — Jean Dupont');
    expect(rendered.segments.at(-1)).toEqual({ kind: 'subject', text: 'Jean Dupont', route: null });
  });
});

describe('le colisage d’une commande (order.ready)', () => {
  it('nomme la fiche qui a colisé, citée sous son nom du moment', () => {
    const rendered = renderFact(
      fact({
        type: 'order.ready',
        subjectType: 'user',
        actorName: 'Hugo Heynard',
        payload: {
          orderId: 'ord_1',
          orderNumber: 'ORD-7',
          readyBy: { id: 'stf_1', name: 'Cécile Martin' },
          readyAt: '2026-09-19T08:00:00.000Z',
        },
      }),
    );

    expect(rendered.sentence).toBe('Cécile Martin a déclaré la commande ORD-7 prête');
    expect(rendered.namesActor).toBe(false);
  });

  it('nomme l’auteur de la ligne quand une ligne ancienne ne cite que l’identifiant', () => {
    // L'auteur d'une ligne `order.ready` est celui qui a scanné (constaté le 2026-09-19).
    const rendered = renderFact(
      fact({
        type: 'order.ready',
        subjectType: 'user',
        actorName: 'Cécile Martin',
        payload: {
          orderId: 'ord_1',
          orderNumber: 'ORD-7',
          readyBy: 'stf_1',
          readyAt: '2026-09-19T08:00:00.000Z',
        },
      }),
    );

    expect(rendered.sentence).toBe('Cécile Martin a déclaré la commande ORD-7 prête');
    expect(rendered.namesActor).toBe(true);
    expect(row(rendered, 'Préparée par')).toBe('(identifiant stf_1)');
  });
});
