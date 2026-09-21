import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { DELIVERY_STEP_FORM_LABELS_FR, DeliveryStepForm } from '@lfd/b2b-ui/company';
import {
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_PHOTO_MAX_BYTES,
  DELIVERY_STEP_TITLE_MAX,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le filet du formulaire partagé `lfd-delivery-step-form`, posé sur le code EN
 * PRODUCTION avant l'extraction du socle photo-cartes (plan « notes photo du
 * commercial », lot 0, D9).
 *
 * La réduction de photo (`shrinkStepPhoto`) est importée en dur par le
 * composant : on ne la remplace pas, on double le NAVIGATEUR qu'elle appelle —
 * `createImageBitmap`, `getContext` et `toBlob` du canvas, que jsdom n'a pas.
 * La vraie arithmétique (1600 px, 0,8 puis 0,6, borne de poids) tourne donc.
 *
 * Le formulaire n'émet que son brouillon (`value`). Ce qui en est tiré —
 * keep / replace / remove — est vérifié là où il franchit la frontière, dans
 * `delivery-procedure-editor.spec.ts` (la passerelle reçoit le changement) :
 * `photoChangeOf` n'est pas exporté par `@lfd/b2b-ui/company`.
 */

const F = DELIVERY_STEP_FORM_LABELS_FR;

type Draft = ReturnType<DeliveryStepForm['value']>;

const EMPTY: Draft = { title: '', body: '', photo: { kind: 'none' } };
const KEPT: Draft = {
  title: 'Portail',
  body: 'Code 4512',
  photo: { kind: 'kept', revision: 'rev1' },
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ── Le navigateur doublé ─────────────────────────────────────────────────────

interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}

interface Encoding {
  readonly width: number;
  readonly height: number;
  readonly type: string | undefined;
  readonly quality: number | undefined;
}

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
);
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

let encodings: Encoding[];
let closed: number;
/** Le poids rendu par l'encodeur, par qualité. */
let weightAt: (quality: number | undefined) => number;
/** Le décodage : une image lisible par défaut. */
let decode: (file: Blob) => Promise<Bitmap>;

function bitmap(width: number, height: number): Bitmap {
  return { width, height, close: () => (closed += 1) };
}

function stubBrowser(): void {
  encodings = [];
  closed = 0;
  weightAt = () => 2048;
  decode = () => Promise.resolve(bitmap(3000, 4000));
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn((file: Blob) => decode(file)),
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage: () => undefined }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value(
      this: HTMLCanvasElement,
      callback: (blob: Blob | null) => void,
      type?: string,
      quality?: number,
    ) {
      encodings.push({ width: this.width, height: this.height, type, quality });
      callback(new Blob([new Uint8Array(weightAt(quality))], { type: 'image/jpeg' }));
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

// ── Le banc ──────────────────────────────────────────────────────────────────

let objectUrls: number;

beforeEach(() => {
  stubBrowser();
  objectUrls = 0;
  URL.createObjectURL = vi.fn(() => {
    objectUrls += 1;
    return `blob:${objectUrls}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreCanvas();
  TestBed.resetTestingModule();
});

async function render(
  value: Draft,
  currentPhotoUrl: string | null = null,
): Promise<ComponentFixture<DeliveryStepForm>> {
  TestBed.configureTestingModule({ imports: [DeliveryStepForm] });
  const fixture = TestBed.createComponent(DeliveryStepForm);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('currentPhotoUrl', currentPhotoUrl);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    // La réduction de photo est une promesse hors d'Angular : on la laisse finir.
    await new Promise((resolve) => setTimeout(resolve));
  }
  fixture.detectChanges();
}

function root(fixture: ComponentFixture<unknown>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<unknown>): string {
  return root(fixture).textContent ?? '';
}

function buttons(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement[] {
  return [...root(fixture).querySelectorAll('button')].filter(
    (b) => (b.textContent ?? '').trim() === label,
  );
}

function one<T extends Element>(fixture: ComponentFixture<unknown>, selector: string): T {
  const found = root(fixture).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`Aucun élément « ${selector} » à l'écran.`);
  }
  return found;
}

function preview(fixture: ComponentFixture<unknown>): string | null {
  return root(fixture).querySelector('img')?.getAttribute('src') ?? null;
}

async function type(
  fixture: ComponentFixture<unknown>,
  selector: string,
  value: string,
): Promise<void> {
  const field = one<HTMLInputElement | HTMLTextAreaElement>(fixture, selector);
  field.value = value;
  field.dispatchEvent(new Event('input'));
  await settle(fixture);
}

/** Choisit un fichier comme le ferait la boîte de dialogue du navigateur. */
function choose(fixture: ComponentFixture<unknown>, name = 'porte.jpg'): File {
  const input = one<HTMLInputElement>(fixture, 'input[type="file"]');
  const file = new File(['brut'], name, { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { length: 1, item: (index: number) => (index === 0 ? file : null) },
  });
  input.dispatchEvent(new Event('change'));
  return file;
}

async function pick(fixture: ComponentFixture<unknown>, name?: string): Promise<File> {
  const file = choose(fixture, name);
  await settle(fixture);
  return file;
}

function pickedPhoto(fixture: ComponentFixture<DeliveryStepForm>): Blob | null {
  const photo = fixture.componentInstance.value().photo;
  return photo.kind === 'picked' ? photo.photo : null;
}

// ── Les cas ──────────────────────────────────────────────────────────────────

describe('DeliveryStepForm — texte', () => {
  it('se remplit depuis le brouillon reçu', async () => {
    const fixture = await render(KEPT);

    expect(one<HTMLInputElement>(fixture, 'fold-input input').value).toBe('Portail');
    expect(one<HTMLTextAreaElement>(fixture, 'fold-textarea textarea').value).toBe('Code 4512');
  });

  it('émet le titre et le texte saisis, tels quels (le nettoyage est à l’envoi)', async () => {
    const fixture = await render(EMPTY);

    await type(fixture, 'fold-input input', ' Portail ');
    await type(fixture, 'fold-textarea textarea', '1er étage\nporte de gauche');

    expect(fixture.componentInstance.value()).toEqual({
      title: ' Portail ',
      body: '1er étage\nporte de gauche',
      photo: { kind: 'none' },
    });
  });

  it('dit les bornes par défaut', async () => {
    const fixture = await render(EMPTY);

    expect(text(fixture)).toContain(F.titleHint);
    expect(text(fixture)).toContain(F.bodyHint);
  });

  it('signale un titre trop long à la place de son indication', async () => {
    const fixture = await render(EMPTY);

    await type(fixture, 'fold-input input', 'a'.repeat(DELIVERY_STEP_TITLE_MAX + 1));

    expect(text(fixture)).toContain(F.titleTooLong);
    expect(text(fixture)).not.toContain(F.titleHint);
  });

  it('ne compte pas les espaces de fin dans la longueur du titre', async () => {
    const fixture = await render(EMPTY);

    await type(fixture, 'fold-input input', `${'a'.repeat(DELIVERY_STEP_TITLE_MAX)}   `);

    expect(text(fixture)).not.toContain(F.titleTooLong);
  });

  it('signale un texte trop long à la place de son indication', async () => {
    const fixture = await render({ ...EMPTY, title: 'Portail' });

    await type(fixture, 'fold-textarea textarea', 'a'.repeat(DELIVERY_STEP_BODY_MAX + 1));

    expect(text(fixture)).toContain(F.bodyTooLong);
    expect(text(fixture)).not.toContain(F.bodyHint);
  });

  /** Existant figé, pas une règle voulue : le libellé `titleRequired` n'est affiché nulle part. */
  it('un titre vide ne montre aucun message « titre requis »', async () => {
    const fixture = await render({ ...EMPTY, body: 'Code 4512' });

    await type(fixture, 'fold-input input', '   ');

    expect(text(fixture)).not.toContain(F.titleRequired);
    expect(text(fixture)).toContain(F.titleHint);
  });

  /** Existant figé, pas une règle voulue : seul le premier refus du brouillon est signalé. */
  it('titre et texte trop longs à la fois : seul le titre est signalé', async () => {
    const fixture = await render(EMPTY);

    await type(fixture, 'fold-input input', 'a'.repeat(DELIVERY_STEP_TITLE_MAX + 1));
    await type(fixture, 'fold-textarea textarea', 'a'.repeat(DELIVERY_STEP_BODY_MAX + 1));

    expect(text(fixture)).toContain(F.titleTooLong);
    expect(text(fixture)).not.toContain(F.bodyTooLong);
    expect(text(fixture)).toContain(F.bodyHint);
  });
});

describe('DeliveryStepForm — photo', () => {
  it('sans photo, propose seulement d’en choisir une', async () => {
    const fixture = await render(EMPTY);

    expect(buttons(fixture, F.choosePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.replacePhoto)).toHaveLength(0);
    expect(buttons(fixture, F.removePhoto)).toHaveLength(0);
    expect(preview(fixture)).toBeNull();
    expect(one<HTMLInputElement>(fixture, 'input[type="file"]').getAttribute('accept')).toBe(
      'image/*',
    );
  });

  it('choisir une photo l’allège à 1600 px en JPEG 0,8, la montre, et l’émet', async () => {
    const fixture = await render(EMPTY);

    const file = await pick(fixture);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(encodings).toEqual([{ width: 1200, height: 1600, type: 'image/jpeg', quality: 0.8 }]);
    expect(closed).toBe(1);
    const photo = pickedPhoto(fixture);
    expect(photo?.size).toBe(2048);
    expect(URL.createObjectURL).toHaveBeenCalledWith(photo);
    expect(preview(fixture)).toBe('blob:1');
    expect(one<HTMLImageElement>(fixture, 'img').getAttribute('alt')).toBe(F.photoPreviewAlt);
    expect(buttons(fixture, F.replacePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.removePhoto)).toHaveLength(1);
  });

  it('pendant l’allègement, le dit et bloque les boutons photo', async () => {
    const pending = deferred<Bitmap>();
    decode = () => pending.promise;
    const fixture = await render(EMPTY);

    choose(fixture);
    await settle(fixture);

    expect(text(fixture)).toContain(F.photoReducing);
    expect(buttons(fixture, F.choosePhoto)[0]?.disabled).toBe(true);

    pending.resolve(bitmap(800, 600));
    await settle(fixture);

    expect(text(fixture)).not.toContain(F.photoReducing);
    expect(buttons(fixture, F.replacePhoto)[0]?.disabled).toBe(false);
    expect(encodings[0]).toMatchObject({ width: 800, height: 600 });
  });

  it('vide le sélecteur après un choix, pour qu’on puisse rechoisir le même fichier', async () => {
    const fixture = await render(EMPTY);
    const input = one<HTMLInputElement>(fixture, 'input[type="file"]');
    const assigned: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (value: string) => assigned.push(value),
    });

    await pick(fixture);

    expect(assigned).toEqual(['']);
  });

  it('refait une passe à 0,6 quand 0,8 dépasse la borne', async () => {
    weightAt = (quality) => (quality === 0.8 ? DELIVERY_STEP_PHOTO_MAX_BYTES + 1 : 700_000);
    const fixture = await render(EMPTY);

    await pick(fixture);

    expect(encodings.map((e) => e.quality)).toEqual([0.8, 0.6]);
    expect(pickedPhoto(fixture)?.size).toBe(700_000);
    expect(text(fixture)).not.toContain(F.photoTooHeavy);
  });

  it('trop lourde même à 0,6 : refusée, dite, et le brouillon n’a pas bougé', async () => {
    weightAt = () => DELIVERY_STEP_PHOTO_MAX_BYTES + 1;
    const fixture = await render(KEPT, 'blob:enregistree');

    await pick(fixture);

    expect(encodings.map((e) => e.quality)).toEqual([0.8, 0.6]);
    expect(text(fixture)).toContain(F.photoTooHeavy);
    expect(fixture.componentInstance.value()).toEqual(KEPT);
    expect(preview(fixture)).toBe('blob:enregistree');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('illisible : refusée sans rien peindre, et dite', async () => {
    decode = () => Promise.reject(new DOMException('format', 'InvalidStateError'));
    const fixture = await render(EMPTY);

    await pick(fixture, 'porte.heic');

    expect(encodings).toEqual([]);
    expect(text(fixture)).toContain(F.photoUnreadable);
    expect(fixture.componentInstance.value().photo).toEqual({ kind: 'none' });
    expect(buttons(fixture, F.choosePhoto)).toHaveLength(1);
  });

  it('un choix réussi efface le refus précédent', async () => {
    decode = () => Promise.reject(new Error('illisible'));
    const fixture = await render(EMPTY);
    await pick(fixture);
    expect(text(fixture)).toContain(F.photoUnreadable);

    decode = () => Promise.resolve(bitmap(1000, 800));
    await pick(fixture);

    expect(text(fixture)).not.toContain(F.photoUnreadable);
    expect(fixture.componentInstance.value().photo.kind).toBe('picked');
  });

  it('une photo enregistrée se montre par l’URL fournie, et propose Remplacer et Retirer', async () => {
    const fixture = await render(KEPT, 'blob:enregistree');

    expect(preview(fixture)).toBe('blob:enregistree');
    expect(buttons(fixture, F.replacePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.removePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.choosePhoto)).toHaveLength(0);
  });

  it('remplacer une photo enregistrée émet la nouvelle et la montre à sa place', async () => {
    const fixture = await render(KEPT, 'blob:enregistree');

    await pick(fixture);

    const value = fixture.componentInstance.value();
    expect(value.title).toBe('Portail');
    expect(value.body).toBe('Code 4512');
    expect(value.photo.kind).toBe('picked');
    expect(preview(fixture)).toBe('blob:1');
    // L'URL de la photo enregistrée appartient à l'éditeur : le formulaire n'y touche pas.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('rechoisir révoque l’aperçu de la photo précédemment choisie', async () => {
    const fixture = await render(EMPTY);
    await pick(fixture);
    const first = pickedPhoto(fixture);

    await pick(fixture);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(preview(fixture)).toBe('blob:2');
    expect(pickedPhoto(fixture)).not.toBe(first);
  });

  it('retirer une photo enregistrée émet « aucune photo », sans toucher au texte', async () => {
    const fixture = await render(KEPT, 'blob:enregistree');

    buttons(fixture, F.removePhoto)[0]?.click();
    await settle(fixture);

    expect(fixture.componentInstance.value()).toEqual({
      title: 'Portail',
      body: 'Code 4512',
      photo: { kind: 'none' },
    });
    expect(preview(fixture)).toBeNull();
    expect(buttons(fixture, F.choosePhoto)).toHaveLength(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('retirer une photo choisie révoque son aperçu et efface un refus affiché', async () => {
    const fixture = await render(EMPTY);
    await pick(fixture);
    weightAt = () => DELIVERY_STEP_PHOTO_MAX_BYTES + 1;
    await pick(fixture);
    expect(text(fixture)).toContain(F.photoTooHeavy);

    buttons(fixture, F.removePhoto)[0]?.click();
    await settle(fixture);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(fixture.componentInstance.value().photo).toEqual({ kind: 'none' });
    expect(text(fixture)).not.toContain(F.photoTooHeavy);
  });

  it('révoque l’aperçu d’une photo choisie à la destruction', async () => {
    const fixture = await render(EMPTY);
    await pick(fixture);

    fixture.destroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  /** Existant figé, pas une règle voulue : une photo gardée sans URL fournie n'a pas d'aperçu, mais Remplacer et Retirer s'affichent. */
  it('une photo gardée sans URL fournie propose Remplacer et Retirer sans aperçu', async () => {
    const fixture = await render(KEPT, null);

    expect(preview(fixture)).toBeNull();
    expect(buttons(fixture, F.replacePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.removePhoto)).toHaveLength(1);
  });
});

describe('DeliveryStepForm — libellés', () => {
  it('prend les libellés fournis', async () => {
    TestBed.configureTestingModule({ imports: [DeliveryStepForm] });
    const fixture = TestBed.createComponent(DeliveryStepForm);
    fixture.componentRef.setInput('value', EMPTY);
    fixture.componentRef.setInput('labels', {
      ...F,
      title: 'Title',
      choosePhoto: 'Choose a photo',
      titleHint: 'At most 80 characters.',
    });
    await settle(fixture);

    expect(text(fixture)).toContain('Title');
    expect(text(fixture)).toContain('At most 80 characters.');
    expect(buttons(fixture, 'Choose a photo')).toHaveLength(1);
    expect(text(fixture)).not.toContain(F.choosePhoto);
  });
});
