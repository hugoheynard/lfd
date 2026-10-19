import { describe, expect, it } from 'vitest';
import { GRANTABLE_STAFF_RESOURCES, staffResourceSchema, type StaffResource } from '@lfd/contracts';

import { toolGroups, toolOf } from '../resource-tools';

describe('les domaines rangés par outil', () => {
  /**
   * 🔴 La garde du module. Une ressource ajoutée au contrat et oubliée ici
   * n'apparaîtrait nulle part à l'écran — un droit invisible, donc jamais
   * accordé, donc une panne qu'on cherche du côté du mur.
   *
   * Le `Record` exhaustif casse déjà la compilation ; ce test tient l'autre
   * moitié, celle que le typage ne voit pas : qu'aucun groupe ne l'avale.
   */
  it('place TOUTES les ressources qui s’accordent, une seule fois chacune', () => {
    const placed = toolGroups().flatMap((group) => group.resources.map((r) => r.resource));

    expect([...placed].sort()).toEqual([...GRANTABLE_STAFF_RESOURCES].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('range du métier vers la plomberie', () => {
    expect(toolGroups().map((group) => group.tool)).toEqual([
      'pim',
      'lfc',
      'b2b',
      'production',
      'handover',
      'delivery',
      'staff',
      'ops',
      'transverse',
    ]);
  });

  /**
   * L'ordre **dans** un groupe reste celui du catalogue de ressources : deux
   * écrans qui trieraient différemment donneraient deux lectures du même rôle.
   */
  it('garde l’ordre du catalogue à l’intérieur d’un groupe', () => {
    const catalogue = staffResourceSchema.options;
    for (const group of toolGroups()) {
      const positions = group.resources.map((r) => catalogue.indexOf(r.resource));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('ne rend aucun groupe vide', () => {
    for (const group of toolGroups()) {
      expect(group.resources.length).toBeGreaterThan(0);
      expect(group.label).not.toBe('');
      expect(group.hint).not.toBe('');
    }
  });

  /** Plus de table à tenir : l'outil est dans la clé. */
  it('lit l’outil dans la clé', () => {
    expect(toolOf('pim_catalog')).toBe('pim');
    expect(toolOf('pim_channels')).toBe('pim');
    expect(toolOf('b2b_pricing')).toBe('b2b');
    expect(toolOf('production_packing')).toBe('production');
    expect(toolOf('handover_counter')).toBe('handover');
    expect(toolOf('staff_access')).toBe('staff');
    expect(toolOf('ops_health')).toBe('ops');
  });

  /**
   * Le découpage rend enfin exprimable ce qui motivait tout : éditer une fiche
   * et diffuser le catalogue sont deux droits, et le référentiel n'est pas le
   * catalogue vendu.
   */
  it('sépare le référentiel de la plateforme, et l’édition de la diffusion', () => {
    expect(toolOf('pim_catalog')).not.toBe(toolOf('lfc_catalog'));
    expect(toolOf('pim_catalog')).toBe(toolOf('pim_channels'));
  });

  /** La seule ressource sans préfixe, et c'est écrit dans son contrat. */
  it('rattache les limites de prix à la vente LFC — pros et particuliers', () => {
    expect(toolOf('lfc_price_limits')).toBe('lfc');
  });

  /** Régression : les droits de livraison tombaient sous « Transverse » (2026-09-29). */
  it('range les droits de livraison dans leur propre groupe', () => {
    expect(toolOf('delivery_run_sheet')).toBe('delivery');
    expect(toolOf('delivery_settings')).toBe('delivery');
    expect(toolOf('delivery_rounds')).toBe('delivery');
    expect(toolOf('delivery_loading')).toBe('delivery');
  });

  /** Régression : `shop_bundles` tombait sous « Transverse » (2026-10-19). */
  it('range les formules avec la Gestion Boutique', () => {
    expect(toolOf('shop_bundles')).toBe('lfc');
    expect(toolOf('shop_bundles')).toBe(toolOf('lfc_loyalty'));
    expect(toolOf('shop_bundles')).toBe(toolOf('lfc_suggestions'));
  });

  it('rattache le journal au transverse — il traverse les outils', () => {
    expect(toolOf('activity')).toBe('transverse');
  });

  /**
   * `lfd_webhooks` (2026-10-19) : une intégration technique avec l'extérieur,
   * qui n'appartient à aucun outil métier — ni à l'équipe et ses accès, ni à
   * la santé de l'écosystème. Son préfixe n'en nomme aucun : transverse.
   */
  it('range les webhooks au transverse — une intégration, pas un outil', () => {
    expect(toolOf('lfd_webhooks')).toBe('transverse');
  });

  it('couvre chaque ressource par `toolOf`', () => {
    for (const resource of staffResourceSchema.options as readonly StaffResource[]) {
      expect(toolOf(resource)).toBeTruthy();
    }
  });
});

/** `plan-droit-lfc-catalog.md`, L2 : une ressource retirée ne se propose plus. */
describe('une ressource retirée', () => {
  const placed = (held: readonly StaffResource[] = []): readonly StaffResource[] =>
    toolGroups(held).flatMap((group) => group.resources.map((r) => r.resource));

  it('n’est jamais proposée à l’accord', () => {
    expect(placed()).not.toContain('b2b_catalog');
  });

  it('se montre, marquée retirée, là où elle est encore portée', () => {
    expect(placed(['b2b_catalog'])).toContain('b2b_catalog');
    const entry = toolGroups(['b2b_catalog'])
      .flatMap((group) => group.resources)
      .find((r) => r.resource === 'b2b_catalog');
    expect(entry?.retired).toBe(true);
  });
});
