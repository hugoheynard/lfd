import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { FoldPanelHostService, provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { CategoryFormPage } from '../category-form-page';
import { CategoryFormStore } from '../category-form-store';
import { CategoryHttpApi } from '../../category-http-api';
import { CategoryStore } from '../../category-store';
import { PointOfSaleHttpApi } from '../../../points-of-sale/point-of-sale-http-api';
import { VatRateHttpApi } from '../../vat-rates/vat-http-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import type { Category } from '../../../data/models';

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat_1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    channelPreset: [{ pointOfSaleId: 'emp_village', context: 'takeaway' }],
    vatByContext: { takeaway: 'tva_55' },
    activeProductCount: 0,
    ...overrides,
  };
}

/**
 * On espionne la couche HTTP et non une façade : ce sont les REQUÊTES qui
 * comptent — lesquelles partent, dans quel ordre, et surtout lesquelles NE
 * partent PAS. C'est là que vit la règle « on n'écrit pas pour rien ».
 */
interface HttpSpy {
  list: ReturnType<typeof vi.fn>;
  detail: ReturnType<typeof vi.fn>;
  setEditorial: ReturnType<typeof vi.fn>;
  setMedia: ReturnType<typeof vi.fn>;
  uploadMedia: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
  setChannels: ReturnType<typeof vi.fn>;
  setVat: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
}

interface Mounted {
  host: HTMLElement;
  http: HttpSpy;
  /** Le store de la PAGE. Il est fourni par le composant, pas par le TestBed :
   *  `TestBed.inject` ne le voit donc pas. */
  store: CategoryFormStore;
  routed: unknown[][];
  detect: () => void;
  stable: () => Promise<unknown>;
}

async function mount(rows: Category[], id: string | null): Promise<Mounted> {
  const http: HttpSpy = {
    list: vi.fn(async () => rows),
    // La page lit le DÉTAIL, pas la liste : elle porte textes et visuels, que
    // la liste ne transporte pas. Une famille absente REJETTE, comme un 404 du
    // référentiel — c'est ce que l'écran traduit en « introuvable ».
    detail: vi.fn(async (id: string) => {
      const found = rows.find((row) => row.id === id);
      if (found === undefined) {
        throw new Error('404');
      }
      return { ...found, editorial: null, media: [] };
    }),
    setEditorial: vi.fn(async () => undefined),
    setMedia: vi.fn(async () => undefined),
    uploadMedia: vi.fn(async () => ({
      id: 'media_1',
      url: 'https://x/neuve.jpg',
      width: 800,
      height: 600,
      bytes: 1024,
      contentType: 'image/jpeg',
    })),
    create: vi.fn(async () => ({ id: 'cat_neuve' })),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    setChannels: vi.fn(async () => undefined),
    setVat: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
  };
  const routed: unknown[][] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideRouter([]),
      provideTestSalesContexts(),
      // Les mêmes libellés qu'en production : les défauts de fold sont anglais,
      // au moment précis où il faut être compris.
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      { provide: CategoryHttpApi, useValue: http },
      { provide: VatRateHttpApi, useValue: { list: async () => [] } },
      {
        provide: PointOfSaleHttpApi,
        useValue: {
          list: async () => [
            { id: 'emp_village', label: 'Village', kind: 'shop', contexts: ['takeaway'] },
          ],
        },
      },
      { provide: FoldPanelHostService, useValue: { open: () => undefined } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => id } } },
      },
      {
        provide: Router,
        useValue: {
          navigate: (commands: unknown[]) => {
            routed.push(commands);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });
  // La liste du store, revenue AVANT le montage : la page la lit pour trouver
  // sa famille. Sans ce `await`, tout test conclurait « introuvable ».
  await TestBed.inject(CategoryStore).reload();
  const fixture = TestBed.createComponent(CategoryFormPage);
  /**
   * L'application est ZONELESS : `whenStable()` dit que la détection de
   * changement est au repos, PAS que les promesses en vol sont retombées. Un
   * enregistrement enchaîne pourtant écrire → relire → naviguer, et l'attente
   * rendait la main au milieu — le test voyait « Chargement… » ou une
   * navigation absente et concluait à un écran cassé.
   *
   * D'où le `setTimeout(0)` : une tâche MACRO vide la file des micro-tâches
   * entière, ce qu'aucun nombre de `await` ne garantit.
   */
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    fixture.detectChanges();
  };
  await settle();
  return {
    host: fixture.nativeElement as HTMLElement,
    http,
    store: fixture.componentRef.injector.get(CategoryFormStore),
    routed,
    detect: () => fixture.detectChanges(),
    stable: settle,
  };
}

const edit = (cat: Category): Promise<Mounted> => mount([cat], cat.id);

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (found === undefined) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

/** Le champ « Nom » — le premier `fold-input` de la page. */
function write(root: HTMLElement, value: string): void {
  const input = root.querySelector('fold-input input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Champ « Nom » introuvable.');
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function lang(root: HTMLElement, code: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('app-lang-switch .vt-btn')].find(
    (b) => (b.textContent ?? '').trim() === code,
  );
  if (found === undefined) {
    throw new Error(`Langue « ${code} » absente.`);
  }
  return found;
}

describe('CategoryFormPage — enregistrer par section', () => {
  it("n'offre AUCUN bouton d'enregistrement tant que rien n'a bougé", async () => {
    // Le bouton n'est pas désactivé, il est ABSENT : il n'y a rien à
    // enregistrer, et un bouton grisé laisserait chercher ce qui le débloque.
    const { host } = await edit(category());

    expect(host.textContent).toContain('À jour');
    expect(() => button(host, 'Enregistrer')).toThrow();
  });

  it("n'écrit QUE la section modifiée", async () => {
    // La régression que ce test ferme : un bouton unique en bas de page
    // renvoyait les quatre verbes du référentiel à chaque fois.
    const { host, http, detect, stable } = await edit(category());

    write(host, 'Viennoiseries fines');
    detect();
    button(host, 'Enregistrer').click();
    await stable();

    expect(http.rename).toHaveBeenCalledTimes(1);
    expect(http.setChannels).not.toHaveBeenCalled();
    expect(http.setVat).not.toHaveBeenCalled();
    // Le parent n'a pas bougé : on n'écrit pas pour rien.
    expect(http.move).not.toHaveBeenCalled();
  });

  it('annule une section sans toucher au référentiel', async () => {
    const { host, http, detect } = await edit(category());

    write(host, 'Autre chose');
    detect();
    button(host, 'Annuler').click();
    detect();

    expect(http.rename).not.toHaveBeenCalled();
    expect(host.textContent).toContain('À jour');
  });
});

describe('CategoryFormPage — une famille archivée est gelée', () => {
  it("n'offre que son nom : ni canaux, ni taux, ni parent", async () => {
    // Le référentiel refuse les trois. Les offrir, c'est promettre un
    // enregistrement qui écrira le nom PUIS échouera sur le reste.
    const { host } = await edit(category({ isArchived: true }));

    expect(host.textContent).toContain('ses réglages sont gelés');
    expect(host.querySelector('app-category-channels-form')).toBeNull();
    expect(host.querySelectorAll('fold-listbox')).toHaveLength(0);
    expect(host.querySelector('fold-input')).not.toBeNull();
  });

  it("ne propose plus d'archiver ce qui l'est déjà", async () => {
    const { host } = await edit(category({ isArchived: true }));
    expect(() => button(host, 'Archiver la famille')).toThrow();
  });
});

describe('CategoryFormPage — la zone dangereuse du rail', () => {
  it('explique le refus AVANT le clic, et n’offre aucune action', async () => {
    const { host } = await edit(category({ activeProductCount: 3 }));

    expect(host.textContent).toContain('Archivage impossible');
    expect(host.textContent).toContain('3 fiche(s) active(s)');
    expect(() => button(host, 'Archiver la famille')).toThrow();
  });

  it("n'archive PAS au premier clic — il révèle une confirmation, en français", async () => {
    const { host, http, routed, detect, stable } = await edit(category());

    button(host, 'Archiver la famille').click();
    detect();
    await stable();
    expect(http.archive).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Confirmer');

    button(host, 'Confirmer').click();
    detect();
    await stable();

    expect(http.archive).toHaveBeenCalledWith('cat_1');
    expect(routed).toContainEqual(['/pim/categories']);
  });
});

describe('CategoryFormPage — création', () => {
  it("n'arme le bouton qu'avec un nom, puis navigue vers la famille créée", async () => {
    const { host, http, routed, detect, stable } = await mount([], null);

    expect(button(host, 'Créer la famille').disabled).toBe(true);

    write(host, 'Tartes');
    detect();
    expect(button(host, 'Créer la famille').disabled).toBe(false);

    button(host, 'Créer la famille').click();
    await stable();

    expect(http.create).toHaveBeenCalledWith({ name: { fr: 'Tartes' } });
    expect(routed).toContainEqual(['/pim/categories', 'cat_neuve']);
  });

  it("n'offre ni canaux ni taux : la famille n'existe pas encore", async () => {
    // Aucune section ne peut s'enregistrer seule avant que la famille ait un
    // identifiant. La création reste donc un geste unique.
    const { host } = await mount([], null);

    expect(host.querySelector('app-category-channels-form')).toBeNull();
    expect(host.querySelector('app-category-summary-rail')).toBeNull();
  });
});

describe('CategoryFormPage — les trois langues du nom', () => {
  it("écrire en anglais n'efface pas le français", async () => {
    const { host, http, detect, stable } = await edit(category());

    lang(host, 'EN').click();
    detect();
    write(host, 'Pastries');
    detect();
    button(host, 'Enregistrer').click();
    await stable();

    expect(http.rename).toHaveBeenCalledWith('cat_1', { fr: 'Viennoiseries', en: 'Pastries' });
  });
});

describe('CategoryFormPage — introuvable', () => {
  it('le dit, au lieu de rendre un formulaire vide', async () => {
    // Un formulaire vide inviterait à saisir une famille qui existe peut-être,
    // et l'enregistrement partirait sur un identifiant fantôme.
    const { host } = await mount([], 'cat_absente');

    expect(host.textContent).toContain('Famille introuvable');
  });
});

describe('CategoryFormPage — les textes', () => {
  /** Le champ d'un libellé donné — `fold-input` ou `<textarea>` natif. */
  function field(root: HTMLElement, label: string): HTMLElement {
    const wrappers = [...root.querySelectorAll('fold-input, label.field')];
    const found = wrappers.find((box) => (box.textContent ?? '').includes(label));
    const control = found?.querySelector('input, textarea');
    if (!(control instanceof HTMLElement)) {
      throw new Error(`Champ « ${label} » introuvable.`);
    }
    return control;
  }

  function fill(control: HTMLElement, value: string): void {
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      control.value = value;
      control.dispatchEvent(new Event('input'));
    }
  }

  it("n'envoie que les champs RÉDIGÉS — un champ vide n'est pas une valeur", async () => {
    const { host, http, detect, stable } = await edit(category());

    fill(field(host, 'Résumé'), 'Du beurre, de la farine.');
    detect();
    button(host, 'Enregistrer').click();
    await stable();

    expect(http.setEditorial).toHaveBeenCalledWith('cat_1', {
      descriptionShort: { fr: 'Du beurre, de la farine.' },
    });
  });

  it('écrit dans la langue affichée sans toucher aux autres', async () => {
    const { host, http, detect, stable } = await edit(category());

    fill(field(host, 'Résumé'), 'Du beurre.');
    detect();
    // Le sélecteur des TEXTES, pas celui du nom : deux sections, deux langues.
    const section = host.querySelector('app-category-communication-form');
    const it = [...(section?.querySelectorAll<HTMLButtonElement>('.vt-btn') ?? [])].find(
      (b) => (b.textContent ?? '').trim() === 'IT',
    );
    it?.click();
    detect();
    fill(field(host, 'Résumé'), 'Burro.');
    detect();

    button(host, 'Enregistrer').click();
    await stable();

    expect(http.setEditorial).toHaveBeenCalledWith('cat_1', {
      descriptionShort: { fr: 'Du beurre.', it: 'Burro.' },
    });
  });

  it('ne se dit pas « non traduite » quand aucun texte n’est écrit', async () => {
    // Une famille sans textes ne manque de rien : compter les langues sur des
    // champs vides ferait s'allumer les trois points ambre en permanence.
    const { host } = await edit(category());
    const section = host.querySelector('app-category-communication-form');
    expect(section?.querySelectorAll('.vt-dot')).toHaveLength(0);
  });
});

describe('CategoryFormPage — les visuels', () => {
  it('ajoute le fichier déposé et envoie la liste ENTIÈRE', async () => {
    const { host, http, store, detect, stable } = await edit(category());

    const dropzone = host.querySelector('fold-file-dropzone input[type="file"]');
    expect(dropzone).not.toBeNull();

    // On passe par le store : déposer un vrai `File` dans un `input` demande un
    // `DataTransfer`, indisponible en environnement de test.
    await store.media.upload(new File([''], 'a.jpg'));
    detect();
    button(host, 'Enregistrer').click();
    await stable();

    expect(http.setMedia).toHaveBeenCalledWith('cat_1', [
      expect.objectContaining({ url: 'https://x/neuve.jpg', role: 'gallery' }),
    ]);
  });

  it('donne à une image sans description une alternative de repli', async () => {
    // La colonne est obligatoire côté référentiel : une chaîne vide passerait
    // pour une alternative rédigée. L'URL vaut mieux — elle se VOIT.
    const { store, detect } = await edit(category());

    await store.media.upload(new File([''], 'a.jpg'));
    detect();

    expect(store.media.items()[0]?.alt).toEqual({ fr: 'https://x/neuve.jpg' });
  });
});
