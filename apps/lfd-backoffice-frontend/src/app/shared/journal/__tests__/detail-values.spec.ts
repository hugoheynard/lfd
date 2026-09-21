import { describe, expect, it } from 'vitest';

import { factDetail } from '../detail-rows';
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
    // Le détail seul : la phrase du schéma SEPA dit déjà l'avant et l'après
    // (lot D), et c'est le mot du dictionnaire qu'on éprouve ici.
    const detail = factDetail(
      'legal_entity.mandate_scheme_changed',
      { subjectLabel: 'La Folie Douce SAS', from: 'CORE', to: 'B2B' },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toContainEqual({ label: 'Avant', value: 'SEPA CORE' });
    expect(detail.rows).toContainEqual({ label: 'Après', value: 'SEPA interentreprises (B2B)' });
    expect(detail.unlabelledValues).toEqual([]);
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

  it('nomme la manière dont le retrait d’une commande a été validé', () => {
    // Le détail seul : la phrase du retrait dit déjà `via` (lot D), et c'est le
    // mot du dictionnaire qu'on éprouve ici.
    const detail = factDetail(
      'order.handed_over',
      {
        orderId: 'ord_1',
        orderNumber: 'ORD-142',
        handedOverBy: { id: 'stf_1', name: 'Cécile Martin' },
        handedOverAt: '2026-09-19T08:00:00.000Z',
        via: 'scan',
      },
      new Set(),
    );

    expect(detail.rows).toContainEqual({ label: 'Par', value: 'QR scanné' });
    expect(detail.unlabelledValues).toEqual([]);
  });

  it('nomme les clés d’un record de contextes de vente — y compris celles d’avant le renommage', () => {
    // Le détail seul : la phrase du taux dit déjà chaque contexte (lot D).
    const detail = factDetail(
      'product.vat_changed',
      {
        subjectLabel: 'Tarte citron',
        vatByContext: {
          takeaway: { from: null, to: { id: 'tva_1', name: 'Réduit' } },
          surPlace: { from: { id: 'tva_2', name: 'Normal' }, to: null },
        },
      },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toEqual([
      { label: 'Taux de TVA par contexte de vente › À emporter', value: 'aucun → Réduit' },
      { label: 'Taux de TVA par contexte de vente › Sur place', value: 'Normal → aucun' },
    ]);
    expect(detail.unlabelledValues).toEqual([]);
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
    // Le détail seul : la phrase du taux la dit déjà, telle quelle (lot D).
    const detail = factDetail(
      'product.vat_changed',
      {
        subjectLabel: 'Tarte citron',
        vatByContext: { brunch: { from: null, to: { id: 'tva_1', name: 'Réduit' } } },
      },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toEqual([
      { label: 'Taux de TVA par contexte de vente › brunch', value: 'aucun → Réduit' },
    ]);
    expect(detail.unlabelledValues).toEqual(['vatByContext=brunch']);
  });

  it('nomme un contexte par le libellé que la charge a figé, dans la phrase comme au détail', () => {
    const rendered = renderFact(
      fact({
        type: 'product_category.vat_changed',
        payload: {
          subjectLabel: 'Tartes',
          vatByContext: {
            brunch: { from: null, to: { id: 'tva_1', name: 'Réduit' } },
            takeaway: { from: null, to: { id: 'tva_1', name: 'Réduit' } },
          },
          contextLabels: { brunch: 'Brunch' },
        },
      }),
    );

    expect(rendered.sentence).toBe(
      'Colette Martin a passé le taux brunch de la famille « Tartes » d’aucun taux à « Réduit » et le taux à emporter d’aucun taux à « Réduit »',
    );
    expect(rendered.consumed).toContain('contextLabels');
    expect(rendered.unlabelledValues).toEqual([]);

    const detail = factDetail(
      'product.vat_changed',
      {
        subjectLabel: 'Tarte citron',
        vatByContext: { brunch: { from: null, to: { id: 'tva_1', name: 'Réduit' } } },
        contextLabels: { brunch: 'Brunch' },
      },
      new Set(['subjectLabel', 'contextLabels']),
    );

    expect(detail.rows).toEqual([
      { label: 'Taux de TVA par contexte de vente › Brunch', value: 'aucun → Réduit' },
    ]);
    expect(detail.unlabelledValues).toEqual([]);
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

  // Le détail seul dans les trois cas suivants : leurs phrases disent déjà
  // `via` et les champs modifiés (lot D), et c'est le dictionnaire qu'on
  // éprouve ici.
  it('nomme un littéral', () => {
    const detail = factDetail(
      'lead.converted',
      { subjectLabel: 'Café des Halles', via: 'manual' },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toContainEqual({ label: 'Par', value: 'À la main' });
  });

  it('nomme les champs d’une modification, une énumération au catalogue', () => {
    const detail = factDetail(
      'company.identity_edited',
      { subjectLabel: 'Café des Halles', fields: ['enseigne', 'vatNumber'] },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toContainEqual({
      label: 'Champs modifiés',
      value: 'Enseigne, Numéro de TVA',
    });
  });

  it('garde telle quelle une chaîne libre hors de son ensemble — une ligne ancienne', () => {
    // Avant le 2026-09-18, l'équipe figeait les LIBELLÉS des champs, pas leurs clés.
    const detail = factDetail(
      'company.identity_edited',
      { subjectLabel: 'Café des Halles', fields: ['Enseigne commerciale'] },
      new Set(['subjectLabel']),
    );

    expect(detail.rows).toContainEqual({ label: 'Champs modifiés', value: 'Enseigne commerciale' });
    expect(detail.unlabelledValues).toEqual([]);
  });

  it('fusionne les ensembles d’un même champ venus de deux familles', () => {
    // `channel` : la diffusion d'une révision ET le canal d'une demande de contact.
    // Le détail seul : la phrase de la demande dit déjà le canal (lot D).
    const support = factDetail(
      'support.requested',
      { supportRequestId: 'sr_1', channel: 'phone' },
      new Set(),
    );
    // Le détail seul : la phrase de l'envoi dit déjà le canal et le mode (lot D).
    // Le canal d'une révision est une énumération au catalogue depuis le lot D :
    // il n'emprunte plus la fusion, mais son mot doit rester le même.
    const push = factDetail(
      'catalog_revision.pushed',
      {
        subjectLabel: 'Rentrée',
        reference: 'R-7WT4NA',
        channel: 'b2b',
        mode: 'dry-run',
        candidates: 12,
        excluded: 1,
      },
      new Set(['subjectLabel']),
    );

    expect(support.rows).toContainEqual({ label: 'Canal', value: 'Téléphone' });
    expect(push.rows).toContainEqual({ label: 'Canal', value: 'Plateforme professionnelle' });
    expect(push.rows).toContainEqual({ label: 'Mode', value: 'Simulation' });
  });
});
