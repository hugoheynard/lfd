import { Injectable } from '@angular/core';

export type { AllergenEntry, AllergenReference, AllergenScope } from '../data/models';

import type { AllergenEntry, AllergenReference, AllergenScope } from '../data/models';

interface Mapping {
  code: string;
  label: string;
  incoCategory: string | null;
}

// Référentiel GS1 → INCO, en dur (port du domaine backend). Les 14 catégories
// INCO sont exactes (annexe II, UE 1169/2011) ; les codes GS1 restent provisoires.
const INCO_LABELS: Record<string, string> = {
  gluten: 'Céréales contenant du gluten',
  tree_nuts: 'Fruits à coque',
  eggs: 'Œufs',
  milk: 'Lait',
  peanuts: 'Arachides',
  crustaceans: 'Crustacés',
  fish: 'Poissons',
  soybeans: 'Soja',
  celery: 'Céleri',
  mustard: 'Moutarde',
  sesame: 'Graines de sésame',
  sulphites: 'Anhydride sulfureux et sulfites',
  lupin: 'Lupin',
  molluscs: 'Mollusques',
};

/** Libellé réglementaire d'une catégorie INCO (`null` hors obligation UE). */
function incoLabelOf(category: string | null): string | null {
  return category === null ? null : (INCO_LABELS[category] ?? null);
}

const MAPPINGS: readonly Mapping[] = [
  { code: 'AW', label: 'Blé', incoCategory: 'gluten' },
  { code: 'AR', label: 'Seigle', incoCategory: 'gluten' },
  { code: 'TBD_BARLEY', label: 'Orge', incoCategory: 'gluten' },
  { code: 'TBD_OATS', label: 'Avoine', incoCategory: 'gluten' },
  { code: 'AN', label: 'Noix', incoCategory: 'tree_nuts' },
  { code: 'BC', label: 'Noisette', incoCategory: 'tree_nuts' },
  { code: 'TBD_ALMOND', label: 'Amande', incoCategory: 'tree_nuts' },
  { code: 'TBD_PISTACHIO', label: 'Pistache', incoCategory: 'tree_nuts' },
  { code: 'AE', label: 'Œuf', incoCategory: 'eggs' },
  { code: 'AM', label: 'Lait', incoCategory: 'milk' },
  { code: 'AP', label: 'Arachide', incoCategory: 'peanuts' },
  { code: 'AC', label: 'Crustacés', incoCategory: 'crustaceans' },
  { code: 'TBD_FISH', label: 'Poisson', incoCategory: 'fish' },
  { code: 'TBD_SOY', label: 'Soja', incoCategory: 'soybeans' },
  { code: 'TBD_CELERY', label: 'Céleri', incoCategory: 'celery' },
  { code: 'TBD_MUSTARD', label: 'Moutarde', incoCategory: 'mustard' },
  { code: 'TBD_SESAME', label: 'Sésame', incoCategory: 'sesame' },
  { code: 'TBD_SULPHITES', label: 'Sulfites', incoCategory: 'sulphites' },
  { code: 'TBD_LUPIN', label: 'Lupin', incoCategory: 'lupin' },
  { code: 'TBD_MOLLUSCS', label: 'Mollusques', incoCategory: 'molluscs' },
  { code: 'UN', label: '(hors UE)', incoCategory: null },
];

/**
 * Référentiel allergènes — donnée statique, sans backend (POC frontend-only).
 * `eu` = liste **légale** (obligation UE) ; `world` = liste **interopérable**.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceApi {
  async allergens(scope: AllergenScope): Promise<AllergenReference> {
    const entries: AllergenEntry[] = MAPPINGS.filter(
      (m) => scope === 'world' || m.incoCategory !== null,
    ).map((m) => ({
      code: m.code,
      label: m.label,
      incoCategory: m.incoCategory,
      incoLabel: incoLabelOf(m.incoCategory),
      provisional: m.code.startsWith('TBD_'),
    }));

    return { scope, entries, hasProvisionalCodes: true };
  }
}
