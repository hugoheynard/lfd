import type { BundleChoiceView, BundleGroupView, BundleView } from '@lfd/contracts';

/** Un article choisi, admissible par défaut. */
export function bundleChoice(overrides: Partial<BundleChoiceView> = {}): BundleChoiceView {
  return {
    sku: 'CAFE-1',
    name: 'Café',
    shelf: 'Boissons',
    thumbnailUrl: null,
    standing: 'admissible',
    ...overrides,
  };
}

export function bundleGroup(overrides: Partial<BundleGroupView> = {}): BundleGroupView {
  return { key: 'boisson', label: 'Boisson', choices: [bundleChoice()], ...overrides };
}

/** Une formule en brouillon, deux groupes d'un article. */
export function bundleView(overrides: Partial<BundleView> = {}): BundleView {
  return {
    key: 'petit-dejeuner',
    name: 'Petit-déjeuner',
    description: null,
    audience: 'public',
    status: 'draft',
    groups: [
      bundleGroup(),
      bundleGroup({
        key: 'viennoiserie',
        label: 'Viennoiserie',
        choices: [bundleChoice({ sku: 'CROI-1', name: 'Croissant', shelf: 'Viennoiseries' })],
      }),
    ],
    createdAt: '2026-10-19T08:00:00.000Z',
    writtenAt: '2026-10-19T08:00:00.000Z',
    writtenBy: null,
    ...overrides,
  };
}
