import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { QualityCheckView, RenderQualityCheckPayload } from '@lfd/contracts';
import { FoldFileDropzoneComponent, FoldPanelRef } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../notify.service';
import { QualityService } from '../quality.service';
import { QualityPanel, type QualityPanelData } from './quality-panel';

/**
 * Ce que le panneau de contrôle tient (`plan-controle-qualite.md`, §5, D8) :
 * la note dès la réserve, les photos déposées dès le choix, un seul `id` par
 * ouverture — rejoué tel quel —, et l'historique de la cible.
 */

const DATA: QualityPanelData = {
  serviceDay: '2026-09-25',
  target: { kind: 'line', sku: 'cro' },
  title: 'Croissant',
  subtitle: '96 pièces au compte',
};

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

function history(): QualityCheckView[] {
  return [
    {
      id: 'c-1',
      target: { kind: 'line', sku: 'cro', quantitySeen: 80 },
      verdict: 'blocking',
      note: 'Brûlés dessous',
      checkedBy: 'staff-1',
      checkedByName: 'Léa Martin',
      checkedAt: 'x',
      photos: [],
    },
    {
      id: 'c-2',
      target: { kind: 'line', sku: 'pac', quantitySeen: 12 },
      verdict: 'ok',
      note: 'Autre produit',
      checkedBy: 'staff-1',
      checkedByName: null,
      checkedAt: 'x',
      photos: [],
    },
  ];
}

interface Fakes {
  render?: (payload: RenderQualityCheckPayload) => Promise<string>;
  deposit?: (photo: Blob) => Promise<string>;
}

async function mount(fakes: Fakes = {}, data: QualityPanelData = DATA) {
  const sent: RenderQualityCheckPayload[] = [];
  const closed: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: QualityService,
        useValue: {
          checks: () => Promise.resolve({ date: DATA.serviceDay, checks: history() }),
          deposit: fakes.deposit ?? (() => Promise.resolve('up-1')),
          render: (payload: RenderQualityCheckPayload) => {
            sent.push(payload);
            return fakes.render?.(payload) ?? Promise.resolve(payload.id);
          },
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: (result?: unknown) => closed.push(result) } },
    ],
  });
  const fixture = TestBed.createComponent(QualityPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const save = (): HTMLButtonElement | null =>
    element.querySelector<HTMLButtonElement>('[data-save]');
  const choose = async (label: string): Promise<void> => {
    const cards = element.querySelectorAll<HTMLElement>('[data-verdict-choice]');
    [...cards].find((card) => card.querySelector('.verdict-label')?.textContent === label)?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const write = async (note: string): Promise<void> => {
    const area = element.querySelector<HTMLTextAreaElement>('[data-note] textarea');
    area!.value = note;
    area!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, element, save, choose, write, sent, closed };
}

function pickerOf(fixture: ComponentFixture<QualityPanel>): FoldFileDropzoneComponent {
  return fixture.debugElement
    .query(By.directive(FoldFileDropzoneComponent))
    .injector.get(FoldFileDropzoneComponent);
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QualityPanel', () => {
  it('rend un OK sans note, avec un id ULID, et se ferme sur un succès', async () => {
    const { save, sent, closed, fixture, choose } = await mount();

    await choose('OK');
    save()?.click();
    await fixture.whenStable();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      serviceDay: DATA.serviceDay,
      target: DATA.target,
      verdict: 'ok',
      note: null,
      uploadIds: [],
    });
    expect(sent[0]?.id).toMatch(ULID);
    expect(closed).toEqual([true]);
  });

  /** §0 : Enregistrer reste désactivé tant qu'une réserve n'a pas de note. */
  it('désactive Enregistrer sur une réserve sans note', async () => {
    const { save, choose, write } = await mount();

    await choose('Réserve');
    expect(save()?.disabled).toBe(true);
    await write('   ');
    expect(save()?.disabled).toBe(true);
    await write('Feuilletage affaissé');
    expect(save()?.disabled).toBe(false);
  });

  /** D8 : un double clic n'envoie qu'une fois. */
  it('n’envoie qu’une fois sur un double clic', async () => {
    const { save, sent, fixture, choose } = await mount();

    await choose('OK');
    save()?.click();
    save()?.click();
    await fixture.whenStable();

    expect(sent).toHaveLength(1);
  });

  /** D8 : après un échec, l'essai suivant rejoue le MÊME id — le serveur est idempotent. */
  it('garde le refus dans le panneau et rejoue le même id', async () => {
    let attempt = 0;
    const { save, sent, closed, element, fixture, choose } = await mount({
      render: (payload) => {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('réseau')) : Promise.resolve(payload.id);
      },
    });

    await choose('OK');
    save()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-refusal]')?.textContent).toContain(
      "Le contrôle n'a pas pu être enregistré.",
    );
    expect(closed).toEqual([]);

    save()?.click();
    await fixture.whenStable();
    expect(sent.map((payload) => payload.id)).toEqual([sent[0]?.id, sent[0]?.id]);
    expect(closed).toEqual([true]);
  });

  /** D8 : chaque photo part dès qu'elle est choisie, puis le verdict la rattache. */
  it('dépose une photo dès le choix et la rattache au verdict ; retirée, elle ne part pas', async () => {
    const deposit = vi.fn(() => Promise.resolve('up-1'));
    const { fixture, element, save, sent, choose } = await mount({ deposit });
    await choose('OK');
    const dropzone = pickerOf(fixture);
    const photo = new File(['x'], 'bac.jpg', { type: 'image/jpeg' });

    dropzone.filesPicked.emit([photo]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(deposit).toHaveBeenCalledWith(photo);
    expect(element.querySelector('[data-photo="ready"]')).not.toBeNull();

    save()?.click();
    await fixture.whenStable();
    expect(sent[0]?.uploadIds).toEqual(['up-1']);
  });

  it('prend une photo avec l’appareil arrière, par le même chemin que la zone de dépôt', async () => {
    const deposit = vi.fn(() => Promise.resolve('up-1'));
    const { fixture, element } = await mount({ deposit });
    const camera = element.querySelector<HTMLInputElement>('input[capture="environment"]');
    const photo = new File(['x'], 'bac.jpg', { type: 'image/jpeg' });
    if (camera === null) {
      throw new Error('champ caméra absent');
    }
    const clicked = vi.spyOn(camera, 'click').mockImplementation(() => undefined);

    element.querySelector<HTMLButtonElement>('[data-camera]')?.click();
    expect(clicked).toHaveBeenCalled();

    Object.defineProperty(camera, 'files', { configurable: true, value: [photo] });
    camera.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(deposit).toHaveBeenCalledWith(photo);
    expect(element.querySelector('[data-photo="ready"]')).not.toBeNull();
  });

  it('retire une photo avant l’enregistrement', async () => {
    const { fixture, element, save, sent, choose } = await mount();
    await choose('OK');
    const dropzone = pickerOf(fixture);

    dropzone.filesPicked.emit([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    await fixture.whenStable();
    fixture.detectChanges();
    const remove = [...element.querySelectorAll<HTMLButtonElement>('[data-photo] button')].find(
      (button) => button.textContent?.includes('Retirer'),
    );
    remove?.click();
    fixture.detectChanges();
    save()?.click();
    await fixture.whenStable();

    expect(element.querySelector('[data-photo]')).toBeNull();
    expect(sent[0]?.uploadIds).toEqual([]);
  });

  it('bloque Enregistrer sur une photo refusée, jusqu’à ce qu’on la retire', async () => {
    const { fixture, element, save, choose } = await mount({
      deposit: () => Promise.reject(new Error('415')),
    });
    await choose('OK');
    const dropzone = pickerOf(fixture);

    dropzone.filesPicked.emit([new File(['x'], 'a.jpg', { type: 'image/jpeg' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('[data-photo="failed"]')).not.toBeNull();
    expect(save()?.disabled).toBe(true);
  });

  it('montre l’historique de CETTE cible, note comprise', async () => {
    const { element } = await mount();
    const checks = element.querySelectorAll('[data-check]');

    expect(checks).toHaveLength(1);
    expect(checks[0]?.textContent).toContain('Bloquant');
    expect(checks[0]?.textContent).toContain('Brûlés dessous');
    expect(checks[0]?.textContent).toContain('Léa Martin');
    expect(checks[0]?.textContent).toContain('sur 80 pièces');
  });

  it('ne présélectionne aucun verdict, et dit pourquoi Enregistrer attend', async () => {
    const { element, save, choose } = await mount();
    const reason = (): string | undefined =>
      element.querySelector('[data-reason]')?.textContent?.trim();

    expect(save()?.disabled).toBe(true);
    expect(reason()).toBe('Choisissez un verdict.');
    await choose('Réserve');
    expect(reason()).toBe('Une note est nécessaire.');
    expect(save()?.textContent?.trim()).toBe('Enregistrer la réserve');
    await choose('Bloquant');
    expect(save()?.textContent?.trim()).toBe('Bloquer');
  });

  it('préremplit la note par une étiquette rapide', async () => {
    const { element, choose, fixture } = await mount();

    await choose('Réserve');
    const tag = [...element.querySelectorAll<HTMLButtonElement>('[data-tags] button')].find(
      (button) => button.textContent?.trim() === 'Cuisson',
    );
    tag?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector<HTMLTextAreaElement>('[data-note] textarea')?.value).toBe(
      'Cuisson : ',
    );
  });

  it('dit qui un blocage retient : les commandes qui attendent la ligne', async () => {
    const { element, choose } = await mount({}, { ...DATA, awaitedBy: ['Chalet Marmotte'] });

    await choose('Bloquant');

    expect(element.querySelector('[data-blocking-hint]')?.textContent).toContain(
      'Commandes concernées : Chalet Marmotte, et toute commande du jour qui contient Croissant.',
    );
  });

  /** A9 : l'en-tête reprend la pastille de la cible — jamais un OK qui la contredit. */
  it('reprend la pastille de la cible en « Actuel · … », ou « Jamais contrôlé »', async () => {
    const stale = await mount(
      {},
      {
        ...DATA,
        current: { rank: 2, label: 'Contrôle · À revoir', variant: 'warning', detail: 'x' },
      },
    );
    expect(stale.element.querySelector('[data-current]')?.textContent).toContain(
      'Actuel · À revoir',
    );
    TestBed.resetTestingModule();

    const never = await mount({}, { ...DATA, current: null });
    expect(never.element.querySelector('[data-current]')?.textContent).toContain('Jamais contrôlé');
  });
});
