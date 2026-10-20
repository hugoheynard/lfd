import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AllergenMatrixRow, AllergenMatrixView } from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AllergenMatrixHttpApi, type AllergenMatrixFilters } from '../allergen-matrix-http-api';
import { otherAllergenName } from '../allergen-matrix-marks';
import { AllergenMatrixStore } from '../allergen-matrix.store';
import { AllergenMatrixPage } from './allergen-matrix-page';

const COLUMNS = [
  { category: 'gluten', label: 'Céréales contenant du gluten' },
  { category: 'milk', label: 'Lait' },
];

function absentCells(): AllergenMatrixRow['cells'] {
  return COLUMNS.map((column) => ({
    category: column.category,
    presence: 'absent' as const,
    contains: [],
    traces: [],
  }));
}

function row(
  over: Partial<AllergenMatrixRow> & Pick<AllergenMatrixRow, 'variantId'>,
): AllergenMatrixRow {
  return {
    productId: `p-${over.variantId}`,
    sku: `SKU-${over.variantId}`,
    productName: `Produit ${over.variantId}`,
    variantName: null,
    state: 'declared',
    cells: absentCells(),
    others: { presence: 'absent', contains: [], traces: [] },
    ...over,
  };
}

const DECLARED = row({
  variantId: 'v1',
  productName: 'Pain de seigle',
  cells: [
    { category: 'gluten', presence: 'contains', contains: ['seigle'], traces: ['orge'] },
    { category: 'milk', presence: 'traces', contains: [], traces: [] },
  ],
  others: {
    presence: 'contains',
    contains: [{ code: 'BWD', label: 'Sarrasin', official: true }],
    traces: [],
  },
});
const NOT_DECLARED = row({
  variantId: 'v2',
  productName: 'Brioche',
  state: 'not_declared',
  cells: [],
  others: null,
});
const NONE = row({ variantId: 'v3', productName: 'Eau', state: 'none_declared' });

function view(over: Partial<AllergenMatrixView> = {}): AllergenMatrixView {
  return {
    locale: 'fr',
    scope: 'published',
    categoryId: null,
    includeUndeclared: true,
    generatedAt: '2026-10-20T10:00:00.000Z',
    lastModifiedAt: '2026-10-19T08:30:00.000Z',
    mentionsTranslated: true,
    columns: COLUMNS,
    families: [
      { id: 'f-pains', name: 'Pains', rows: [DECLARED, NOT_DECLARED] },
      { id: 'f-boissons', name: 'Boissons', rows: [NONE] },
    ],
    ...over,
  };
}

interface ApiDouble {
  readonly read: ReturnType<
    typeof vi.fn<(filters: AllergenMatrixFilters) => Promise<AllergenMatrixView>>
  >;
  readonly pdf: ReturnType<typeof vi.fn>;
  readonly csv: ReturnType<typeof vi.fn>;
}

function setup(read: ApiDouble['read']): ApiDouble {
  const api: ApiDouble = {
    read,
    pdf: vi.fn().mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'matrice.pdf' }),
    csv: vi.fn().mockResolvedValue({ blob: new Blob(['a;b']), fileName: null }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      { provide: AllergenMatrixHttpApi, useValue: api },
    ],
  });
  return api;
}

async function render() {
  const fixture = TestBed.createComponent(AllergenMatrixPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(host: HTMLElement): string {
  return (host.textContent ?? '').replace(/\s+/gu, ' ');
}

describe('AllergenMatrixPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('lit la matrice en français, sur le périmètre par défaut du plan', async () => {
    const api = setup(vi.fn().mockResolvedValue(view()));
    await render();
    expect(api.read).toHaveBeenCalledWith({
      locale: 'fr',
      scope: 'published',
      categoryId: null,
      includeUndeclared: true,
    });
  });

  it('écrit « Non renseigné » et « Aucun allergène déclaré » en clair, sans les confondre', async () => {
    setup(vi.fn().mockResolvedValue(view()));
    const host = (await render()).nativeElement as HTMLElement;
    expect(text(host)).toContain('Non renseigné');
    expect(text(host)).toContain('Aucun allergène déclaré');
  });

  it('dessine contient ET traces dans la même case, avec les précisions nommées', async () => {
    setup(vi.fn().mockResolvedValue(view()));
    const host = (await render()).nativeElement as HTMLElement;
    expect(text(host)).toContain('seigle');
    expect(text(host)).toContain('orge');
    expect(host.querySelector('[aria-label="Contient"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Peut contenir des traces"]')).not.toBeNull();
  });

  it('nomme un allergène officiel hors annexe avec son code GS1, dans « Autres »', async () => {
    setup(vi.fn().mockResolvedValue(view()));
    const host = (await render()).nativeElement as HTMLElement;
    expect(text(host)).toContain('Sarrasin (BWD)');
  });

  it('dit la dernière modification d’une fiche, à l’heure de Paris', async () => {
    setup(vi.fn().mockResolvedValue(view()));
    const host = (await render()).nativeElement as HTMLElement;
    expect(text(host)).toContain("Dernière modification d'une fiche : 19 octobre 2026 à 10:30");
  });

  it('rend l’erreur de lecture dans un état d’alerte, pas une matrice vide', async () => {
    setup(vi.fn().mockRejectedValue(new Error('boom')));
    const host = (await render()).nativeElement as HTMLElement;
    expect(host.querySelector('fold-empty-state[tone="alert"]')).not.toBeNull();
    expect(text(host)).not.toContain('Aucune déclinaison');
  });

  it('rend le vide quand aucune déclinaison n’est retenue', async () => {
    setup(vi.fn().mockResolvedValue(view({ families: [], lastModifiedAt: null })));
    const host = (await render()).nativeElement as HTMLElement;
    expect(text(host)).toContain('Aucune déclinaison');
    expect(text(host)).not.toContain('Dernière modification');
  });
});

describe('AllergenMatrixStore', () => {
  function store(): AllergenMatrixStore {
    return TestBed.runInInjectionContext(() => new AllergenMatrixStore());
  }

  it('garde la liste des familles quand on en choisit une', async () => {
    const read = vi
      .fn<(filters: AllergenMatrixFilters) => Promise<AllergenMatrixView>>()
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ categoryId: 'f-pains', families: [view().families[0]!] }));
    setup(read);
    const s = store();
    await s.load();
    s.setCategory('f-pains');
    await vi.waitFor(() => expect(s.loading()).toBe(false));

    expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'f-pains' }));
    expect(s.familyOptions().map((o) => o.label)).toEqual(['Pains', 'Boissons']);
  });

  it('n’applique pas une réponse dépassée par une demande plus récente', async () => {
    let releaseFirst: (value: AllergenMatrixView) => void = () => undefined;
    const read = vi
      .fn<(filters: AllergenMatrixFilters) => Promise<AllergenMatrixView>>()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce(view({ scope: 'all' }));
    setup(read);
    const s = store();
    const first = s.load();
    s.setScope('all');
    await vi.waitFor(() => expect(s.view()?.scope).toBe('all'));
    releaseFirst(view({ scope: 'published' }));
    await first;

    expect(s.view()?.scope).toBe('all');
  });

  it('exporte dans la langue choisie, avec les filtres de la page', async () => {
    const api = setup(vi.fn().mockResolvedValue(view()));
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const s = store();
    s.includeUndeclared.set(false);
    s.exportLocale.set('it');
    await s.export('pdf');

    expect(api.pdf).toHaveBeenCalledWith({
      locale: 'it',
      scope: 'published',
      categoryId: null,
      includeUndeclared: false,
    });
    expect(createObjectURL).toHaveBeenCalled();
    expect(s.exporting()).toBeNull();
  });

  it('retient le refus d’un export au lieu de l’avaler', async () => {
    const api = setup(vi.fn().mockResolvedValue(view()));
    api.csv.mockRejectedValue(new Error('refus'));
    const s = store();
    await s.export('csv');
    expect(s.exportError()).not.toBeNull();
  });
});

describe('otherAllergenName', () => {
  it('n’affiche jamais le code libre d’une entrée maison', () => {
    expect(otherAllergenName({ code: 'MAISON1', label: 'Fève tonka', official: false })).toBe(
      'Fève tonka',
    );
  });
});
