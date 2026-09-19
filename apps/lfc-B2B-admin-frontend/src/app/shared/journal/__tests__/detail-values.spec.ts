import { describe, expect, it } from 'vitest';

import { renderFact, type FactInput } from '../render-fact';

/**
 * **Les valeurs d'ensemble fermé, en mots** (plan des phrases du journal,
 * lot D) : une énumération, un littéral, la clé d'un record, une chaîne que le
 * catalogue laisse libre mais qui ne prend que quelques valeurs — le détail
 * les dit par le dictionnaire des valeurs, jamais par leur code.
 *
 * Régression : le détail affichait `write`, `takeaway`, `scan` tels quels
 * (relevé au lot C, 2026-09-19).
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

describe('le détail dit les valeurs d’ensemble fermé par leur mot', () => {
  it('nomme une énumération, même sous une clé `from` / `to`', () => {
    const rendered = renderFact(
      fact({
        type: 'legal_entity.mandate_scheme_changed',
        subjectType: 'legal_entity',
        payload: { subjectLabel: 'La Folie Douce SAS', from: 'CORE', to: 'B2B' },
      }),
    );

    expect(rendered.detail).toContainEqual({
      label: 'Avant',
      value: 'SEPA CORE',
    });
    expect(row(rendered, 'Après')).toBe('SEPA interentreprises (B2B)');
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('nomme une énumération dans un objet imbriqué d’une liste', () => {
    const rendered = renderFact(
      fact({
        type: 'staff_role.created',
        subjectType: 'staff_role',
        payload: {
          subjectLabel: 'Commercial',
          label: 'Commercial',
          grants: [{ resource: 'b2b_pricing', resourceLabel: 'Tarification', action: 'write' }],
        },
      }),
    );

    expect(row(rendered, 'Droits')).toBe(
      'Clé de la ressource : Tarification · Ressource : Tarification · Action : Écriture',
    );
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('nomme la manière dont une commande a été remise', () => {
    const rendered = renderFact(
      fact({
        type: 'order.handed_over',
        subjectType: 'user',
        payload: {
          orderId: 'ord_1',
          orderNumber: 'ORD-142',
          handedOverBy: { id: 'stf_1', name: 'Cécile Martin' },
          handedOverAt: '2026-09-19T08:00:00.000Z',
          via: 'scan',
        },
      }),
    );

    expect(row(rendered, 'Par')).toBe('QR scanné');
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('nomme les clés d’un record de contextes de vente — y compris celles d’avant le renommage', () => {
    const rendered = renderFact(
      fact({
        type: 'product.vat_changed',
        payload: {
          subjectLabel: 'Tarte citron',
          vatByContext: {
            takeaway: { from: null, to: { id: 'tva_1', name: 'Réduit' } },
            surPlace: { from: { id: 'tva_2', name: 'Normal' }, to: null },
          },
        },
      }),
    );

    expect(row(rendered, 'Taux de TVA par contexte de vente › À emporter')).toBe('aucun → Réduit');
    expect(row(rendered, 'Taux de TVA par contexte de vente › Sur place')).toBe('Normal → aucun');
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('lit une charge qui EST un record de contextes — le taux par contexte d’avant le lot B', () => {
    // Régression : ses clés s'affichaient brutes (« emporter : … »), la charge
    // n'étant pas un objet mais le record lui-même.
    const rendered = renderFact(
      fact({
        type: 'product_category.vat_changed',
        subjectType: 'product_category',
        payload: { emporter: { from: 'tva_1', to: 'tva_2' } },
      }),
    );

    expect(rendered.detail).toEqual([
      { label: 'À emporter', value: '(identifiant tva_1) → (identifiant tva_2)' },
    ]);
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('laisse un contexte créé à l’écran sous sa clé, et le signale', () => {
    // Sa clé est une donnée : aucun dictionnaire ne peut la connaître d'avance.
    const rendered = renderFact(
      fact({
        type: 'product.vat_changed',
        payload: {
          subjectLabel: 'Tarte citron',
          vatByContext: { brunch: { from: null, to: { id: 'tva_1', name: 'Réduit' } } },
        },
      }),
    );

    expect(row(rendered, 'Taux de TVA par contexte de vente › brunch')).toBe('aucun → Réduit');
    expect(rendered.unlabelledValues).toEqual(['vatByContext=brunch']);
  });

  it('laisse telles quelles les clés de donnée d’un record libre', () => {
    const rendered = renderFact(
      fact({
        type: 'variant.added',
        payload: {
          subjectLabel: 'Tarte citron',
          sku: 'TAR-001-M',
          name: { fr: 'Tarte citron — moyenne' },
          options: { Taille: 'Moyenne' },
        },
      }),
    );

    expect(row(rendered, 'Options › Taille')).toBe('Moyenne');
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('nomme un littéral', () => {
    const rendered = renderFact(
      fact({
        type: 'lead.converted',
        subjectType: 'lead',
        payload: { subjectLabel: 'Café des Halles', via: 'manual' },
      }),
    );

    expect(row(rendered, 'Par')).toBe('À la main');
  });

  it('nomme les champs d’une modification que le catalogue type en chaîne libre', () => {
    const rendered = renderFact(
      fact({
        type: 'company.identity_edited',
        subjectType: 'company',
        payload: { subjectLabel: 'Café des Halles', fields: ['enseigne', 'vatNumber'] },
      }),
    );

    expect(row(rendered, 'Champs modifiés')).toBe('Enseigne, Numéro de TVA');
  });

  it('garde telle quelle une chaîne libre hors de son ensemble — une ligne ancienne', () => {
    // Avant le 2026-09-18, l'équipe figeait les LIBELLÉS des champs, pas leurs clés.
    const rendered = renderFact(
      fact({
        type: 'company.identity_edited',
        subjectType: 'company',
        payload: { subjectLabel: 'Café des Halles', fields: ['Enseigne commerciale'] },
      }),
    );

    expect(row(rendered, 'Champs modifiés')).toBe('Enseigne commerciale');
    expect(rendered.unlabelledValues).toEqual([]);
  });

  it('fusionne les ensembles d’un même champ venus de deux familles', () => {
    // `channel` : la diffusion d'une révision ET le canal d'une demande de contact.
    const support = renderFact(
      fact({
        type: 'support.requested',
        subjectType: 'company',
        payload: { supportRequestId: 'sr_1', channel: 'phone' },
      }),
    );
    const push = renderFact(
      fact({
        type: 'catalog_revision.pushed',
        subjectType: 'catalog_revision',
        payload: {
          subjectLabel: 'Rentrée',
          reference: 'R-7WT4NA',
          channel: 'b2b',
          mode: 'dry-run',
          candidates: 12,
          excluded: 1,
        },
      }),
    );

    expect(row(support, 'Canal')).toBe('Téléphone');
    expect(row(push, 'Canal')).toBe('Plateforme professionnelle');
    expect(row(push, 'Mode')).toBe('Simulation');
  });
});
