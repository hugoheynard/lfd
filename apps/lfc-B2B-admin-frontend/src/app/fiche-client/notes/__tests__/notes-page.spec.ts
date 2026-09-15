import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PhotoCardViewer, type PhotoCardViewerData } from '@lfd/b2b-ui/photo-cards';
import type { ClientNoteView, CustomerSheetView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService, FoldPanelRef, provideFoldInlineConfirmLabels } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CustomerSheetService } from '../../../commercial/calendrier/customer-sheet/customer-sheet.service';
import type { PermissionGuard } from '../../../auth/permission.guard';
import { FicheClientShell } from '../../fiche-client-shell';
import { ficheClientRoutes } from '../../fiche-client.routes';
import { CLIENT_NOTES_EDITOR_LABELS as L } from '../client-notes.usage';
import { ClientNotesPage } from '../notes-page';

/**
 * L'onglet **Notes** : qui le voit, qui y écrit, et ce qui transite — les
 * vignettes seulement, à leur passage à l'écran ; la photo lisible à
 * l'ouverture en grand (plan « notes photo du commercial », D5, D7 bis, D11).
 *
 * La passerelle n'est PAS doublée : ce sont les vraies requêtes que l'écran
 * émet, interceptées par le banc HTTP.
 */

const BASE = '/admin/companies/co_1/notes';
const READ: StaffPermission = 'b2b_client_notes:read';
const WRITE: StaffPermission = 'b2b_client_notes:write';

function note(id: string, number: number, over: Partial<ClientNoteView> = {}): ClientNoteView {
  return {
    id,
    number,
    title: `Note ${id}`,
    body: '',
    photoRevision: null,
    createdAt: '2026-09-15T08:00:00.000Z',
    createdByName: 'Camille',
    ...over,
  };
}

const NOTES: readonly ClientNoteView[] = [
  note('n1', 1, { title: 'Visite du mardi', photoRevision: 'r1' }),
  note('n2', 2, { title: 'Commande de Noël' }),
];

/** Un `IntersectionObserver` qu'on déclenche à la main. */
class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  readonly targets: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    this.targets.splice(this.targets.indexOf(target), 1);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Toutes les cibles observées entrent à l'écran. */
  enter(): void {
    const entries = this.targets.map((target): IntersectionObserverEntry => {
      const rect = target.getBoundingClientRect();
      return {
        target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: rect,
        intersectionRect: rect,
        rootBounds: null,
        time: 0,
      };
    });
    this.callback(entries, this);
  }
}

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
);
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

/** Un décodage qui réussit, et un encodage dont le poids suit la taille peinte. */
function stubBrowserPhotoReduction(): void {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 3000, height: 4000, close: () => undefined })),
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage: () => undefined }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value(this: HTMLCanvasElement, callback: (blob: Blob | null) => void) {
      callback(new Blob([new Uint8Array(this.height)], { type: 'image/jpeg' }));
    },
  });
}

function restoreCanvas(): void {
  if (originalGetContext !== undefined) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContext);
  }
  if (originalToBlob !== undefined) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalToBlob);
  }
}

let http: HttpTestingController;

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  let objectUrls = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++objectUrls}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreCanvas();
  TestBed.resetTestingModule();
});

function permissionsStub(granted: readonly StaffPermission[]): Pick<PermissionsStore, 'can'> {
  return { can: (permission) => granted.includes(permission) };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  fixture.detectChanges();
}

async function render(
  granted: readonly StaffPermission[],
  notes: readonly ClientNoteView[] = NOTES,
): Promise<ComponentFixture<ClientNotesPage>> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PermissionsStore, useValue: permissionsStub(granted) },
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
    ],
  });
  http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ClientNotesPage);
  fixture.componentRef.setInput('id', 'co_1');
  await settle(fixture);
  http
    .expectOne((r) => r.method === 'GET' && r.url.endsWith(BASE))
    .flush({ companyId: 'co_1', notes });
  await settle(fixture);
  return fixture;
}

function root(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function buttons(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement[] {
  return [...root(fixture).querySelectorAll('button')].filter(
    (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
  );
}

function photoRequests(): number {
  return http.match((r) => /\/notes\/[^/]+\/(photo|thumbnail)$/.test(r.url)).length;
}

describe('l’onglet Notes — qui le voit', () => {
  it('sa route exige `b2b_client_notes:read`, et non le droit de la fiche', () => {
    const notes = ficheClientRoutes[0]?.children?.find((route) => route.path === 'notes');
    const guards = (notes?.canActivate ?? []) as PermissionGuard[];

    expect(guards.map((guard) => guard.permission)).toEqual([READ]);
  });

  async function shellTabs(granted: readonly StaffPermission[]): Promise<string[]> {
    const sheet = { sheet: (): Promise<CustomerSheetView> => new Promise(() => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CustomerSheetService, useValue: sheet },
        { provide: PermissionsStore, useValue: permissionsStub(granted) },
      ],
    });
    const fixture = TestBed.createComponent(FicheClientShell);
    fixture.componentRef.setInput('id', 'co_1');
    await settle(fixture);
    return [...root(fixture).querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => /^\/(informations|notes|commandes)$/.test(href));
  }

  it('l’onglet paraît entre Informations et Commandes pour qui a le droit', async () => {
    expect(await shellTabs([READ])).toEqual(['/informations', '/notes', '/commandes']);
  });

  it('l’onglet n’est pas proposé à qui lit la fiche sans lire les notes', async () => {
    expect(await shellTabs(['b2b_companies:read'])).toEqual(['/informations', '/commandes']);
  });
});

describe('l’onglet Notes — lecture et écriture', () => {
  it('sans `write`, lecture seule : les notes, sans aucun geste', async () => {
    const fixture = await render([READ]);

    expect(root(fixture).textContent).toContain('Visite du mardi');
    expect(root(fixture).textContent).toContain('Déposée le 15 septembre 2026 par Camille');
    expect(buttons(fixture, L.addCard)).toHaveLength(0);
    expect(buttons(fixture, L.revise)).toHaveLength(0);
    expect(root(fixture).querySelector('fold-button-icon')).toBeNull();
  });

  it('avec `write`, « Ajouter une note » paraît AVANT la liste — la nouvelle arrive en tête', async () => {
    const fixture = await render([READ, WRITE]);

    const add = buttons(fixture, L.addCard)[0];
    const list = root(fixture).querySelector('ol');
    if (add === undefined || list === null) {
      throw new Error('Ni le geste d’ajout ni la liste ne devraient manquer.');
    }
    expect(add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ajouter une note photographiée envoie la photo lisible ET sa vignette, plus légère', async () => {
    stubBrowserPhotoReduction();
    const fixture = await render([READ, WRITE], []);

    buttons(fixture, L.addCard)[0]?.click();
    await settle(fixture);
    const title = root(fixture).querySelector('fold-input input') as HTMLInputElement;
    title.value = 'Visite du jeudi';
    title.dispatchEvent(new Event('input'));
    const file = root(fixture).querySelector('input[type="file"]') as HTMLInputElement;
    expect(file.getAttribute('accept')).toBe('image/*');
    expect(file.hasAttribute('capture')).toBe(false);
    const picked = new File(['brut'], 'note.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: { length: 1, item: (index: number) => (index === 0 ? picked : null) },
    });
    file.dispatchEvent(new Event('change'));
    await settle(fixture);

    buttons(fixture, L.submitNew)[0]?.click();
    await settle(fixture);

    const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith(BASE));
    const body = post.request.body as FormData;
    expect(body.get('title')).toBe('Visite du jeudi');
    // Le poids simulé suit la hauteur peinte : 2400 px pour la lisible, 320 pour la vignette.
    expect((body.get('photo') as Blob).size).toBe(2400);
    expect((body.get('thumbnail') as Blob).size).toBe(320);
    post.flush({ id: 'n9' });
    await settle(fixture);
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith(BASE))
      .flush({ companyId: 'co_1', notes: [] });
    await settle(fixture);
  });
});

describe('l’onglet Notes — ce qui transite', () => {
  it('ne télécharge AUCUNE image tant que la carte n’entre pas à l’écran, puis la vignette seule', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    const fixture = await render([READ]);

    expect(photoRequests()).toBe(0);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);

    FakeIntersectionObserver.instances[0]?.enter();
    await settle(fixture);

    const thumb = http.expectOne((r) => r.url.endsWith(`${BASE}/n1/thumbnail`));
    expect(thumb.request.params.get('rev')).toBe('r1');
    http.expectNone((r) => r.url.endsWith(`${BASE}/n1/photo`));
    thumb.flush(new Blob(['v']));
    await settle(fixture);

    expect(root(fixture).querySelector('.card-thumb img')?.getAttribute('src')).toMatch(/^blob:/);
  });

  it('sans IntersectionObserver, charge les vignettes tout de suite — jamais la photo lisible', async () => {
    const fixture = await render([READ]);

    http.expectOne((r) => r.url.endsWith(`${BASE}/n1/thumbnail`)).flush(new Blob(['v']));
    http.expectNone((r) => r.url.endsWith('/photo'));
    await settle(fixture);
  });

  it('un clic sur la vignette ouvre la vue en grand, qui seule lit la photo lisible', async () => {
    const fixture = await render([READ]);
    http.expectOne((r) => r.url.endsWith(`${BASE}/n1/thumbnail`)).flush(new Blob(['v']));
    await settle(fixture);
    const panels = TestBed.inject(FoldPanelHostService);
    const open = vi.spyOn(panels, 'open').mockReturnValue(new FoldPanelRef(1, () => undefined));

    buttons(fixture, 'Agrandir la photo de la note « Visite du mardi »')[0]?.click();
    await settle(fixture);

    expect(open).toHaveBeenCalledTimes(1);
    const [component, config] = open.mock.calls[0] ?? [];
    expect(component).toBe(PhotoCardViewer);
    const data = (config as { data: PhotoCardViewerData }).data;
    expect(data.title).toBe('Visite du mardi');

    const reading = data.load();
    const photo = http.expectOne((r) => r.url.endsWith(`${BASE}/n1/photo`));
    expect(photo.request.params.get('rev')).toBe('r1');
    photo.flush(new Blob(['lisible']));
    expect(await reading).toBeInstanceOf(Blob);
  });
});
