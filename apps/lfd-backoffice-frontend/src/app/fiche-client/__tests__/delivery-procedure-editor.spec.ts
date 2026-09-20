import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DELIVERY_PROCEDURE_EDITOR_LABELS_FR,
  DELIVERY_STEP_FORM_LABELS_FR,
  DeliveryProcedureConflictError,
  DeliveryProcedureEditor,
  type DeliveryProcedureEditorLabels,
  DeliveryProcedureGateway,
  DeliveryProcedureWriteError,
  type DeliveryStepPhotoChange,
} from '@lfd/b2b-ui/company';
import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  type DeliveryProcedureStepView,
  type DeliveryProcedureView,
  type DeliveryStepFields,
} from '@lfd/contracts';
import { provideFoldInlineConfirmLabels } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le filet de l'éditeur partagé `lfd-delivery-procedure-editor`, posé sur le code
 * EN PRODUCTION avant l'extraction du socle photo-cartes (plan « notes photo du
 * commercial », lot 0, D9). Il fige l'existant : ce qui doit rester vrai après
 * l'extraction, et quelques comportements discutables nommés comme tels.
 *
 * Ici plutôt que dans `@lfd/b2b-ui` : le runner du paquet est Jest sous Node, qui
 * ne charge pas `@angular/core` (ESM seulement) — les composants du paquet
 * s'éprouvent dans une app consommatrice.
 */

const L = DELIVERY_PROCEDURE_EDITOR_LABELS_FR;
const F = DELIVERY_STEP_FORM_LABELS_FR;

function step(
  id: string,
  number: number,
  over: Partial<DeliveryProcedureStepView> = {},
): DeliveryProcedureStepView {
  return { id, number, title: `Étape ${id}`, body: '', photoRevision: null, ...over };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** La passerelle doublée : elle tient une procédure en mémoire, et échoue sur commande. */
class FakeGateway extends DeliveryProcedureGateway {
  steps: DeliveryProcedureStepView[] = [];
  loads = 0;
  /** Remplace la PROCHAINE lecture seulement. */
  nextLoad: (() => Promise<DeliveryProcedureView>) | null = null;
  added: { fields: DeliveryStepFields; photo: Blob | null }[] = [];
  revised: { stepId: string; fields: DeliveryStepFields; change: DeliveryStepPhotoChange }[] = [];
  removed: string[] = [];
  reorders: (readonly string[])[] = [];
  photoCalls: { addressId: string; stepId: string; revision: string }[] = [];
  writeError: unknown = null;
  photoImpl: (stepId: string) => Promise<Blob> = () =>
    Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));

  load(addressId: string): Promise<DeliveryProcedureView> {
    this.loads += 1;
    const next = this.nextLoad;
    if (next !== null) {
      this.nextLoad = null;
      return next();
    }
    return Promise.resolve({ addressId, steps: this.steps });
  }

  addStep(_addressId: string, fields: DeliveryStepFields, photo: Blob | null): Promise<string> {
    this.added.push({ fields, photo });
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    const id = `new${this.steps.length}`;
    this.steps = [...this.steps, step(id, this.steps.length + 1, fields)];
    return Promise.resolve(id);
  }

  reviseStep(
    _addressId: string,
    stepId: string,
    fields: DeliveryStepFields,
    change: DeliveryStepPhotoChange,
  ): Promise<void> {
    this.revised.push({ stepId, fields, change });
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    this.steps = this.steps.map((s) => (s.id === stepId ? { ...s, ...fields } : s));
    return Promise.resolve();
  }

  removeStep(_addressId: string, stepId: string): Promise<void> {
    this.removed.push(stepId);
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    this.steps = this.steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, number: i + 1 }));
    return Promise.resolve();
  }

  reorder(_addressId: string, stepIds: readonly string[]): Promise<void> {
    this.reorders.push(stepIds);
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    this.steps = stepIds.map((id, i) => ({
      ...(this.steps.find((s) => s.id === id) ?? step(id, i + 1)),
      number: i + 1,
    }));
    return Promise.resolve();
  }

  photo(addressId: string, stepId: string, revision: string): Promise<Blob> {
    this.photoCalls.push({ addressId, stepId, revision });
    return this.photoImpl(stepId);
  }
}

// ── Le navigateur doublé pour la réduction de photo (jsdom ne peint pas) ─────

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext',
);
const originalToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

/** Un décodage qui réussit, et un encodage JPEG qui rend un petit fichier. */
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
    value: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([new Uint8Array(2048)], { type: 'image/jpeg' })),
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

let gateway: FakeGateway;
let counts: number[];
let objectUrls: number;

beforeEach(() => {
  gateway = new FakeGateway();
  counts = [];
  objectUrls = 0;
  // jsdom ne fabrique pas d'URL d'objet : chaque appel rend une URL distincte.
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

interface RenderOptions {
  readonly canEdit?: boolean;
  readonly labels?: DeliveryProcedureEditorLabels;
  readonly settle?: boolean;
}

async function render(
  options: RenderOptions = {},
): Promise<ComponentFixture<DeliveryProcedureEditor>> {
  TestBed.configureTestingModule({
    imports: [DeliveryProcedureEditor],
    providers: [
      { provide: DeliveryProcedureGateway, useValue: gateway },
      // Comme `app.config.ts` : fold parle anglais par défaut.
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
    ],
  });
  const fixture = TestBed.createComponent(DeliveryProcedureEditor);
  fixture.componentRef.setInput('addressId', 'adr_1');
  if (options.canEdit !== undefined) {
    fixture.componentRef.setInput('canEdit', options.canEdit);
  }
  if (options.labels !== undefined) {
    fixture.componentRef.setInput('labels', options.labels);
  }
  fixture.componentInstance.stepCountChange.subscribe((count) => counts.push(count));
  if (options.settle === false) {
    fixture.detectChanges();
  } else {
    await settle(fixture);
  }
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
    // Les gestes asynchrones hors d'Angular (réduction de photo) finissent ici.
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
    (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
  );
}

function button(fixture: ComponentFixture<unknown>, label: string): HTMLButtonElement {
  const found = buttons(fixture, label)[0];
  if (found === undefined) {
    throw new Error(`Aucun bouton « ${label} » à l'écran.`);
  }
  return found;
}

function one<T extends Element>(fixture: ComponentFixture<unknown>, selector: string): T {
  const found = root(fixture).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`Aucun élément « ${selector} » à l'écran.`);
  }
  return found;
}

async function click(fixture: ComponentFixture<unknown>, label: string): Promise<void> {
  button(fixture, label).click();
  await settle(fixture);
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

function stepTitles(fixture: ComponentFixture<unknown>): string[] {
  return [...root(fixture).querySelectorAll('ol fold-element-title')].map(
    // fold-element-title rend son titre dans un `span[role="heading"]`, pas un `h*`.
    (el) => el.querySelector('[role="heading"]')?.textContent?.trim() ?? '',
  );
}

async function pickPhoto(fixture: ComponentFixture<unknown>): Promise<void> {
  const input = one<HTMLInputElement>(fixture, 'input[type="file"]');
  const file = new File(['brut'], 'porte.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { length: 1, item: (index: number) => (index === 0 ? file : null) },
  });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

// ── Les cas ──────────────────────────────────────────────────────────────────

describe('DeliveryProcedureEditor — lecture', () => {
  it('montre le chargement tant que la procédure n’est pas lue, puis les étapes dans l’ordre', async () => {
    const pending = deferred<DeliveryProcedureView>();
    gateway.nextLoad = () => pending.promise;
    gateway.steps = [
      step('a', 1, { title: 'Portail', body: 'Code 4512' }),
      step('b', 2, { title: 'Cour' }),
    ];
    const fixture = await render({ settle: false });

    expect(text(fixture)).toContain(L.loading);

    pending.resolve({ addressId: 'adr_1', steps: gateway.steps });
    await settle(fixture);

    expect(text(fixture)).not.toContain(L.loading);
    expect(stepTitles(fixture)).toEqual(['Portail', 'Cour']);
    expect(text(fixture)).toContain('Étape 1');
    expect(text(fixture)).toContain('Étape 2');
    expect(text(fixture)).toContain('Code 4512');
  });

  /** Existant figé, pas une règle voulue : le rang affiché est `number` de la vue, jamais recalculé. */
  it('affiche le numéro porté par la vue, même s’il ne suit pas le rang', async () => {
    gateway.steps = [step('a', 7, { title: 'Portail' })];
    const fixture = await render();

    expect(text(fixture)).toContain('Étape 7');
    expect(text(fixture)).not.toContain('Étape 1');
  });

  it('va chercher la vignette d’une étape photographiée, et révoque son URL à la destruction', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', photoRevision: 'rev1' }), step('b', 2)];
    const fixture = await render();

    expect(gateway.photoCalls).toEqual([{ addressId: 'adr_1', stepId: 'a', revision: 'rev1' }]);
    const img = one<HTMLImageElement>(fixture, 'img');
    expect(img.getAttribute('src')).toBe('blob:1');
    expect(img.getAttribute('alt')).toBe(L.photoAlt('Portail'));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    fixture.destroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('une vignette qui ne se télécharge pas laisse l’étape lisible', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', body: 'Code 4512', photoRevision: 'rev1' })];
    gateway.photoImpl = () => Promise.reject(new Error('réseau'));
    const fixture = await render();

    expect(text(fixture)).toContain('Portail');
    expect(text(fixture)).toContain('Code 4512');
    expect(root(fixture).querySelector('img')).toBeNull();
  });

  it('un échec de chargement dit l’erreur et propose de réessayer', async () => {
    gateway.nextLoad = () => Promise.reject(new Error('réseau'));
    gateway.steps = [step('a', 1, { title: 'Portail' })];
    const fixture = await render({ canEdit: true });

    expect(text(fixture)).toContain(L.loadError);
    expect(stepTitles(fixture)).toEqual([]);

    await click(fixture, L.retry);

    expect(gateway.loads).toBe(2);
    expect(text(fixture)).not.toContain(L.loadError);
    expect(stepTitles(fixture)).toEqual(['Portail']);
  });

  it('une relecture qui échoue après une écriture garde la liste et le dit', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render({ canEdit: true });
    gateway.nextLoad = () => Promise.reject(new Error('réseau'));

    await click(fixture, L.moveDown);

    expect(text(fixture)).toContain(L.loadError);
    expect(stepTitles(fixture)).toEqual(['Portail', 'Cour']);
    expect(buttons(fixture, L.retry)).toHaveLength(0);
  });

  it('sans `canEdit` (défaut), lecture seule : aucun geste d’écriture', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render();

    expect(stepTitles(fixture)).toEqual(['Portail', 'Cour']);
    expect(buttons(fixture, L.addStep)).toHaveLength(0);
    expect(buttons(fixture, L.revise)).toHaveLength(0);
    expect(buttons(fixture, L.moveUp)).toHaveLength(0);
    expect(buttons(fixture, L.moveDown)).toHaveLength(0);
    expect(root(fixture).querySelector('fold-button-icon')).toBeNull();
  });

  it('vide et en lecture seule, le dit sans inviter à écrire', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain(L.emptyTitle);
    expect(text(fixture)).toContain(L.emptySubtitleReadOnly);
    expect(text(fixture)).not.toContain(L.emptySubtitleEditable);
  });

  it(`en lecture seule à ${DELIVERY_PROCEDURE_MAX_STEPS} étapes, ne parle pas de borne`, async () => {
    gateway.steps = Array.from({ length: DELIVERY_PROCEDURE_MAX_STEPS }, (_, i) =>
      step(`s${i}`, i + 1),
    );
    const fixture = await render();

    expect(text(fixture)).not.toContain(L.limitReached);
  });
});

describe('DeliveryProcedureEditor — écriture', () => {
  it('ajoute une étape en fin, puis relit', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render({ canEdit: true });
    const loadsBefore = gateway.loads;

    await click(fixture, L.addStep);
    expect(text(fixture)).toContain(L.newStepHeading);
    expect(button(fixture, L.add).disabled).toBe(true);

    await type(fixture, 'fold-input input', '  Sonner à l’interphone ');
    await type(fixture, 'fold-textarea textarea', 'Deux coups brefs');
    expect(button(fixture, L.add).disabled).toBe(false);
    await click(fixture, L.add);

    expect(gateway.added).toEqual([
      { fields: { title: 'Sonner à l’interphone', body: 'Deux coups brefs' }, photo: null },
    ]);
    expect(gateway.loads).toBe(loadsBefore + 1);
    expect(stepTitles(fixture)).toEqual(['Portail', 'Cour', 'Sonner à l’interphone']);
    expect(text(fixture)).toContain('Étape 3');
  });

  it('ajoute une étape avec la photo allégée choisie', async () => {
    stubBrowserPhotoReduction();
    const fixture = await render({ canEdit: true });

    await click(fixture, L.addStep);
    await type(fixture, 'fold-input input', 'Portail');
    await pickPhoto(fixture);
    await click(fixture, L.add);

    expect(gateway.added).toHaveLength(1);
    const sent = gateway.added[0]?.photo;
    expect(sent).toBeInstanceOf(Blob);
    expect(sent?.type).toBe('image/jpeg');
    expect(sent?.size).toBe(2048);
  });

  it('annuler ramène à la liste sans rien écrire', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' })];
    const fixture = await render({ canEdit: true });

    await click(fixture, L.addStep);
    await type(fixture, 'fold-input input', 'Cour');
    await click(fixture, L.cancel);

    expect(gateway.added).toEqual([]);
    expect(stepTitles(fixture)).toEqual(['Portail']);
  });

  it(`masque « Ajouter une étape » à ${DELIVERY_PROCEDURE_MAX_STEPS} étapes, et dit la borne`, async () => {
    gateway.steps = Array.from({ length: DELIVERY_PROCEDURE_MAX_STEPS - 1 }, (_, i) =>
      step(`s${i}`, i + 1),
    );
    const below = await render({ canEdit: true });
    expect(buttons(below, L.addStep)).toHaveLength(1);
    expect(text(below)).not.toContain(L.limitReached);
    TestBed.resetTestingModule();

    gateway.steps = Array.from({ length: DELIVERY_PROCEDURE_MAX_STEPS }, (_, i) =>
      step(`s${i}`, i + 1),
    );
    const fixture = await render({ canEdit: true });

    expect(buttons(fixture, L.addStep)).toHaveLength(0);
    expect(text(fixture)).toContain(L.limitReached);
  });

  it('refaire préremplit le formulaire, et n’arme Enregistrer que sur un vrai changement', async () => {
    gateway.steps = [
      step('a', 1, { title: 'Portail' }),
      step('b', 2, { title: 'Cour', body: 'Porte de gauche' }),
    ];
    const fixture = await render({ canEdit: true });

    buttons(fixture, L.revise)[1]?.click();
    await settle(fixture);

    expect(text(fixture)).toContain(L.reviseHeading(2));
    expect(one<HTMLInputElement>(fixture, 'fold-input input').value).toBe('Cour');
    expect(one<HTMLTextAreaElement>(fixture, 'fold-textarea textarea').value).toBe(
      'Porte de gauche',
    );
    expect(button(fixture, L.save).disabled).toBe(true);

    await type(fixture, 'fold-input input', 'Cour  ');
    expect(button(fixture, L.save).disabled).toBe(true);

    await type(fixture, 'fold-input input', 'Grande cour');
    expect(button(fixture, L.save).disabled).toBe(false);

    await type(fixture, 'fold-input input', 'Cour');
    expect(button(fixture, L.save).disabled).toBe(true);
  });

  it('refaire le seul titre envoie « keep » pour la photo', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', body: 'Code 4512', photoRevision: 'rev1' })];
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);
    await type(fixture, 'fold-input input', 'Grand portail');
    await click(fixture, L.save);

    expect(gateway.revised).toEqual([
      {
        stepId: 'a',
        fields: { title: 'Grand portail', body: 'Code 4512' },
        change: { kind: 'keep' },
      },
    ]);
    expect(stepTitles(fixture)).toEqual(['Grand portail']);
  });

  it('retirer la photo d’une étape suffit à armer Enregistrer, et envoie « remove »', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', photoRevision: 'rev1' })];
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);
    expect(one<HTMLImageElement>(fixture, 'lfd-delivery-step-form img').getAttribute('src')).toBe(
      'blob:1',
    );
    await click(fixture, F.removePhoto);
    expect(button(fixture, L.save).disabled).toBe(false);
    await click(fixture, L.save);

    expect(gateway.revised).toEqual([
      { stepId: 'a', fields: { title: 'Portail', body: '' }, change: { kind: 'remove' } },
    ]);
  });

  it('remplacer la photo d’une étape envoie « replace » avec la photo allégée', async () => {
    stubBrowserPhotoReduction();
    gateway.steps = [step('a', 1, { title: 'Portail', photoRevision: 'rev1' })];
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);
    await pickPhoto(fixture);
    expect(button(fixture, L.save).disabled).toBe(false);
    await click(fixture, L.save);

    expect(gateway.revised).toHaveLength(1);
    const change = gateway.revised[0]?.change;
    expect(change?.kind).toBe('replace');
    expect(change?.kind === 'replace' ? change.photo.size : null).toBe(2048);
  });

  it('monter et descendre sont désactivés aux bornes, et envoient l’ordre complet', async () => {
    gateway.steps = [
      step('a', 1, { title: 'Portail' }),
      step('b', 2, { title: 'Cour' }),
      step('c', 3, { title: 'Escalier' }),
    ];
    const fixture = await render({ canEdit: true });

    expect(buttons(fixture, L.moveUp).map((b) => b.disabled)).toEqual([true, false, false]);
    expect(buttons(fixture, L.moveDown).map((b) => b.disabled)).toEqual([false, false, true]);

    buttons(fixture, L.moveUp)[2]?.click();
    await settle(fixture);
    expect(gateway.reorders).toEqual([['a', 'c', 'b']]);
    expect(stepTitles(fixture)).toEqual(['Portail', 'Escalier', 'Cour']);

    buttons(fixture, L.moveDown)[0]?.click();
    await settle(fixture);
    expect(gateway.reorders).toEqual([
      ['a', 'c', 'b'],
      ['c', 'a', 'b'],
    ]);
  });

  it('supprime une étape seulement après la confirmation', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);
    expect(text(fixture)).toContain(L.removeExplanation);
    await click(fixture, L.removeAction);
    expect(gateway.removed).toEqual([]);
    expect(text(fixture)).toContain(L.removeConfirm);

    await click(fixture, 'Confirmer');

    expect(gateway.removed).toEqual(['a']);
    expect(stepTitles(fixture)).toEqual(['Cour']);
    expect(text(fixture)).toContain('Étape 1');
  });

  it('émet le nombre d’étapes quand il change, jamais à la première lecture', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' }), step('b', 2, { title: 'Cour' })];
    const fixture = await render({ canEdit: true });
    expect(counts).toEqual([]);

    await click(fixture, L.moveDown);
    expect(counts).toEqual([]);

    await click(fixture, L.addStep);
    await type(fixture, 'fold-input input', 'Escalier');
    await click(fixture, L.add);
    expect(counts).toEqual([3]);

    await click(fixture, L.revise);
    await click(fixture, L.removeAction);
    await click(fixture, 'Confirmer');
    expect(counts).toEqual([3, 2]);
  });

  it('un conflit ramène à la liste rechargée et le dit', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail' })];
    const fixture = await render({ canEdit: true });
    const loadsBefore = gateway.loads;
    gateway.writeError = new DeliveryProcedureConflictError('changé');

    await click(fixture, L.revise);
    await type(fixture, 'fold-input input', 'Grand portail');
    await click(fixture, L.save);

    expect(gateway.loads).toBe(loadsBefore + 1);
    expect(text(fixture)).toContain(L.conflict);
    expect(root(fixture).querySelector('lfd-delivery-step-form')).toBeNull();
    expect(stepTitles(fixture)).toEqual(['Portail']);
  });

  it('une écriture refusée affiche son message et garde le formulaire, saisie comprise', async () => {
    const fixture = await render({ canEdit: true });
    const loadsBefore = gateway.loads;
    gateway.writeError = new DeliveryProcedureWriteError('Cette adresse a été archivée.');

    await click(fixture, L.addStep);
    await type(fixture, 'fold-input input', 'Portail');
    await click(fixture, L.add);

    expect(text(fixture)).toContain('Cette adresse a été archivée.');
    expect(gateway.loads).toBe(loadsBefore);
    expect(one<HTMLInputElement>(fixture, 'fold-input input').value).toBe('Portail');
    expect(button(fixture, L.add).disabled).toBe(false);
  });

  it('une panne inattendue affiche le message générique, jamais le sien', async () => {
    const fixture = await render({ canEdit: true });
    gateway.writeError = new Error('TypeError: fetch failed');

    await click(fixture, L.addStep);
    await type(fixture, 'fold-input input', 'Portail');
    await click(fixture, L.add);

    expect(text(fixture)).toContain(L.writeFailed);
    expect(text(fixture)).not.toContain('fetch failed');
  });
});

describe('DeliveryProcedureEditor — libellés', () => {
  it('parle français par défaut', async () => {
    const fixture = await render({ canEdit: true });

    expect(text(fixture)).toContain(L.emptyTitle);
    expect(text(fixture)).toContain(L.emptySubtitleEditable);
    expect(buttons(fixture, L.addStep)).toHaveLength(1);
  });

  it('prend les libellés fournis, formulaire compris', async () => {
    const labels: DeliveryProcedureEditorLabels = {
      ...L,
      addStep: 'Add a step',
      stepNumber: (n) => `Step ${n}`,
      moveUp: 'Move step up',
      newStepHeading: 'New step',
      form: { ...F, choosePhoto: 'Choose a photo' },
    };
    gateway.steps = [step('a', 1, { title: 'Gate' })];
    const fixture = await render({ canEdit: true, labels });

    expect(text(fixture)).toContain('Step 1');
    expect(buttons(fixture, 'Move step up')).toHaveLength(1);

    await click(fixture, 'Add a step');

    expect(text(fixture)).toContain('New step');
    expect(buttons(fixture, 'Choose a photo')).toHaveLength(1);
    expect(text(fixture)).not.toContain(F.choosePhoto);
  });
});

describe('DeliveryProcedureEditor — existant figé', () => {
  /** Existant figé, pas une règle voulue : sans vignette téléchargée, Remplacer et Retirer s'offrent sans aperçu. */
  it('refaire une étape dont la vignette a échoué propose Remplacer et Retirer sans aperçu', async () => {
    gateway.steps = [step('a', 1, { title: 'Portail', photoRevision: 'rev1' })];
    gateway.photoImpl = () => Promise.reject(new Error('réseau'));
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);

    expect(buttons(fixture, F.replacePhoto)).toHaveLength(1);
    expect(buttons(fixture, F.removePhoto)).toHaveLength(1);
    expect(root(fixture).querySelector('lfd-delivery-step-form img')).toBeNull();
  });

  /** Existant figé, pas une règle voulue : une vignette arrivée après un rechargement qui l'a écartée reste retenue jusqu'à la destruction. */
  it('une vignette arrivée après le rechargement qui a retiré son étape n’est révoquée qu’à la destruction', async () => {
    const late = deferred<Blob>();
    gateway.steps = [step('a', 1, { title: 'Portail', photoRevision: 'rev1' })];
    gateway.photoImpl = () => late.promise;
    const fixture = await render({ canEdit: true });

    await click(fixture, L.revise);
    await click(fixture, L.removeAction);
    await click(fixture, 'Confirmer');
    expect(stepTitles(fixture)).toEqual([]);

    late.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));
    await settle(fixture);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    fixture.destroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});
