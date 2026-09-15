import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PhotoCardViewer,
  type PhotoCardViewerData,
  type PhotoCardViewerLabels,
} from '@lfd/b2b-ui/photo-cards';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La **vue en grand** du socle photo-cartes — éprouvée ici parce que le runner
 * de `@lfd/b2b-ui` est Node, sans banc Angular. Ce qu'on tient : la photo
 * n'est lue qu'à l'ouverture, se bascule ajustée / taille réelle, un échec se
 * rattrape, et l'URL d'objet ne survit pas au dialogue.
 */

const LABELS: PhotoCardViewerLabels = {
  enlarge: (title) => `Agrandir ${title}`,
  photoAlt: (title) => `Photo de ${title}`,
  loading: 'Chargement de la photo…',
  loadError: 'La photo n’a pas pu être chargée.',
  retry: 'Réessayer',
  actualSize: 'Taille réelle',
  fitToScreen: 'Ajuster à l’écran',
  close: 'Fermer',
};

let closed: number;

beforeEach(() => {
  closed = 0;
  URL.createObjectURL = vi.fn(() => 'blob:grand');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  fixture.detectChanges();
}

async function render(load: () => Promise<Blob>): Promise<ComponentFixture<PhotoCardViewer>> {
  TestBed.configureTestingModule({
    imports: [PhotoCardViewer],
    providers: [{ provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => (closed += 1)) }],
  });
  const fixture = TestBed.createComponent(PhotoCardViewer);
  const data: PhotoCardViewerData = { title: 'Visite du mardi', labels: LABELS, load };
  fixture.componentRef.setInput('data', data);
  await settle(fixture);
  return fixture;
}

function root(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function button(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  const found = [...root(fixture).querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === label,
  );
  if (found === undefined) {
    throw new Error(`Aucun bouton « ${label} » à l'écran.`);
  }
  return found;
}

describe('PhotoCardViewer', () => {
  it('montre le chargement, puis la photo ajustée', async () => {
    let resolve: (blob: Blob) => void = () => undefined;
    const fixture = await render(() => new Promise<Blob>((res) => (resolve = res)));

    expect(root(fixture).textContent).toContain(LABELS.loading);

    resolve(new Blob(['jpeg']));
    await settle(fixture);

    const img = root(fixture).querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:grand');
    expect(img?.getAttribute('alt')).toBe('Photo de Visite du mardi');
    expect(root(fixture).querySelector('.stage.actual')).toBeNull();
  });

  it('bascule taille réelle / ajustée, au bouton comme au clic sur l’image', async () => {
    const fixture = await render(() => Promise.resolve(new Blob(['jpeg'])));

    button(fixture, LABELS.actualSize).click();
    await settle(fixture);
    expect(root(fixture).querySelector('.stage.actual')).not.toBeNull();
    expect(button(fixture, LABELS.fitToScreen).getAttribute('aria-pressed')).toBe('true');

    root(fixture).querySelector('img')?.click();
    await settle(fixture);
    expect(root(fixture).querySelector('.stage.actual')).toBeNull();
    expect(button(fixture, LABELS.actualSize)).toBeDefined();
  });

  it('un échec de lecture le dit, et réessayer relit', async () => {
    const load = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValue(new Blob(['jpeg']));
    const fixture = await render(load);

    expect(root(fixture).textContent).toContain(LABELS.loadError);
    expect(root(fixture).querySelector('img')).toBeNull();

    button(fixture, LABELS.retry).click();
    await settle(fixture);

    expect(load).toHaveBeenCalledTimes(2);
    expect(root(fixture).querySelector('img')).not.toBeNull();
  });

  it('Fermer ferme le dialogue, et l’URL d’objet est révoquée à sa destruction', async () => {
    const fixture = await render(() => Promise.resolve(new Blob(['jpeg'])));

    button(fixture, LABELS.close).click();
    expect(closed).toBe(1);

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:grand');
  });
});
