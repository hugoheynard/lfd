import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ProductionWorksheetView, WorkshopBatch, WorkshopLine } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { GestureFeedback } from '../../../shared/gesture-feedback/gesture-feedback';
import { markKey } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';
import { WorkshopOutbox } from '../outbox/workshop-outbox';
import { WorkshopProblemOpener } from '../openers/workshop-problem-opener';
import { BATCH_KEPT, DONE_KEPT } from '../rules/workshop-send-errors';
import { WorkshopDayReader } from './workshop-day.reader';
import { WorkshopGestures } from './workshop-gestures';

/**
 * Les gestes de la fiche d'atelier, éprouvés SANS l'écran : le lecteur de
 * journée et la file d'envoi sont les vrais, le serveur, le retour sensible et
 * le panneau « Problème » sont des doublures qui implémentent leur surface.
 *
 * Ce que ces cas tiennent :
 *
 * - un geste ne part jamais sans journée lue, et un double appui n'en envoie
 *   qu'un ;
 * - une fournée ou un « Fait » sans réponse est gardé SOUS SA CLÉ : le même
 *   geste rejoué la réutilise, un refus du serveur ne garde rien ;
 * - une ligne n'est jamais laissée désarmée, quelle que soit l'issue.
 */

const DAY = '2026-09-15';
const NEXT_DAY = '2026-09-16';

function line(over: Partial<WorkshopLine> = {}): WorkshopLine {
  return {
    sku: 'BAG',
    productName: 'Baguette tradition',
    quantity: 160,
    saleUnit: 'piece',
    containerLabel: '4 tourneuses',
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: 160,
    surplus: 0,
    batches: [],
    container: { unitsPerContainer: 40, singular: 'tourneuse' },
    ...over,
  };
}

const BAGUETTE = line();
const SEIGLE = line({ sku: 'SEI', productName: 'Pain de seigle', quantity: 30, remaining: 30 });

function sheet(date: string = DAY): ProductionWorksheetView {
  return {
    date,
    generatedAt: `${date}T04:05:00`,
    retakenAt: null,
    lines: [],
    drift: null,
    groups: [],
    shelvesKnown: true,
    relativeDay: 'today',
  };
}

/** Un refus du serveur, avec le message de l'enveloppe d'erreur de l'API. */
function refusal409(message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code: 'x', message } });
}

/** Le réseau coupé : le serveur a peut-être écrit. */
function offline(): HttpErrorResponse {
  return new HttpErrorResponse({ status: 0 });
}

/** Le service du serveur : il garde ce qu'il a reçu et répond ce qu'on lui dit. */
class FakeWorksheetService {
  view: ProductionWorksheetView | null = sheet();
  reads = 0;
  retakes: string[] = [];
  retakeError: unknown = null;
  readonly batches: {
    date: string;
    sku: string;
    id: string;
    quantity: number;
    initials: string;
  }[] = [];
  readonly cancels: { date: string; id: string }[] = [];
  readonly dones: { date: string; sku: string; key: string }[] = [];
  /** Ce que le serveur répond aux écritures — `null` = il les accepte. */
  writeError: unknown = null;
  /** Retient les réponses, pour éprouver ce qui se passe PENDANT l'envoi. */
  holdWrites = false;
  private readonly held: (() => void)[] = [];

  async current(): Promise<ProductionWorksheetView> {
    this.reads += 1;
    if (this.view === null) {
      throw new Error('lecture refusée');
    }
    return this.view;
  }

  async retake(date: string): Promise<void> {
    this.retakes.push(date);
    if (this.retakeError !== null) {
      throw this.retakeError;
    }
  }

  async recordBatch(
    date: string,
    sku: string,
    id: string,
    payload: { quantity: number; initials: string },
  ): Promise<void> {
    this.batches.push({ date, sku, id, ...payload });
    await this.answer();
  }

  async cancelBatch(date: string, id: string): Promise<void> {
    this.cancels.push({ date, id });
    await this.answer();
  }

  async markDone(date: string, sku: string, key: string): Promise<void> {
    this.dones.push({ date, sku, key });
    await this.answer();
  }

  readonly steps: { gesture: string; sku: string; station: string; key: string }[] = [];

  async markStepDone(_date: string, sku: string, station: string, key: string): Promise<void> {
    this.steps.push({ gesture: 'done', sku, station, key });
    await this.answer();
  }

  async undoStep(_date: string, sku: string, station: string, key: string): Promise<void> {
    this.steps.push({ gesture: 'undo', sku, station, key });
    await this.answer();
  }

  release(): void {
    for (const resolve of this.held.splice(0)) {
      resolve();
    }
  }

  private async answer(): Promise<void> {
    if (this.holdWrites) {
      await new Promise<void>((resolve) => this.held.push(resolve));
    }
    if (this.writeError !== null) {
      throw this.writeError;
    }
  }
}

/** Le retour sensible, enregistré : ce que la personne a senti, dans l'ordre. */
class RecordingFeedback {
  readonly accepted_: string[] = [];
  readonly refused_: string[] = [];

  accepted(message: string): void {
    this.accepted_.push(message);
  }

  refused(message: string): void {
    this.refused_.push(message);
  }
}

/** Le panneau rouge : il garde ce qu'on lui ouvre et ne répond que sur ordre. */
class StubProblemOpener {
  readonly opened: { date: string; sku: string }[] = [];
  answer = false;
  failure: unknown = null;
  hold = false;
  private readonly held: (() => void)[] = [];

  readonly stepReds: { sku: string; station: string }[] = [];

  async openStepRedFor(_date: string, opened: WorkshopLine, station: string): Promise<boolean> {
    this.stepReds.push({ sku: opened.sku, station });
    return this.answer;
  }

  async openFor(date: string, opened: WorkshopLine): Promise<boolean> {
    this.opened.push({ date, sku: opened.sku });
    if (this.hold) {
      await new Promise<void>((resolve) => this.held.push(resolve));
    }
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.answer;
  }

  close(): void {
    for (const resolve of this.held.splice(0)) {
      resolve();
    }
  }
}

/** Un tour de boucle : les doublures répondent dans des promesses. */
const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

let api: FakeWorksheetService;
let feedback: RecordingFeedback;
let opener: StubProblemOpener;
let identity: { firstName: string; lastName: string } | null;

function build(): { gestures: WorkshopGestures; day: WorkshopDayReader; outbox: WorkshopOutbox } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      WorkshopDayReader,
      WorkshopGestures,
      WorkshopOutbox,
      { provide: WorksheetService, useValue: api },
      { provide: GestureFeedback, useValue: feedback },
      { provide: WorkshopProblemOpener, useValue: opener },
      { provide: PermissionsStore, useValue: { identity: () => identity } },
    ],
  });
  return {
    gestures: TestBed.inject(WorkshopGestures),
    day: TestBed.inject(WorkshopDayReader),
    outbox: TestBed.inject(WorkshopOutbox),
  };
}

beforeEach(() => {
  // La file d'envoi vit dans le stockage de l'appareil : chaque test part vide.
  localStorage.clear();
  api = new FakeWorksheetService();
  feedback = new RecordingFeedback();
  opener = new StubProblemOpener();
  identity = { firstName: 'Marie', lastName: 'Jost' };
});

describe('WorkshopGestures — déclarer une fournée', () => {
  it('envoie la quantité et les initiales, relit, retient la dernière et le dit', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.record(BAGUETTE, 40);

    expect(api.batches).toHaveLength(1);
    expect(api.batches[0]).toMatchObject({ date: DAY, sku: 'BAG', quantity: 40, initials: 'MJ' });
    // Une relecture suit l'écriture : le chiffre vient du serveur.
    expect(api.reads).toBe(2);
    expect(gestures.last()).toEqual({ line: BAGUETTE, id: api.batches[0]?.id, quantity: 40 });
    expect(feedback.accepted_).toEqual(['Fournée enregistrée — Baguette tradition, 40']);
    expect(gestures.refused()).toBeNull();
    expect(day.busy().size).toBe(0);
  });

  it('sans personne connectée, déclare avec des initiales vides plutôt que d’en inventer', async () => {
    identity = null;
    const { gestures, day } = build();
    await day.load();

    await gestures.record(BAGUETTE, 40);

    expect(api.batches[0]?.initials).toBe('');
  });

  // Régression visée : le double appui qui créait deux fournées.
  it('ignore un second appui sur la ligne pendant que le premier part', async () => {
    const { gestures, day } = build();
    await day.load();
    api.holdWrites = true;

    const first = gestures.record(BAGUETTE, 40);
    await tick();
    expect(gestures.isBusy(BAGUETTE)).toBe(true);
    await gestures.record(BAGUETTE, 40);
    api.release();
    await first;

    expect(api.batches).toHaveLength(1);
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
    expect(feedback.accepted_).toHaveLength(1);
    // Le second appui ignoré n'a ni refusé ni effacé quoi que ce soit.
    expect(feedback.refused_).toEqual([]);
  });

  it('désarme une ligne sans toucher à sa voisine', async () => {
    const { gestures, day } = build();
    await day.load();
    api.holdWrites = true;

    const first = gestures.record(BAGUETTE, 40);
    await tick();
    const other = gestures.record(SEIGLE, 10);
    await tick();

    expect(gestures.isBusy(BAGUETTE)).toBe(true);
    expect(gestures.isBusy(SEIGLE)).toBe(true);
    api.release();
    await Promise.all([first, other]);
    expect(api.batches.map((batch) => batch.sku).sort()).toEqual(['BAG', 'SEI']);
  });

  it('ne part pas tant qu’aucune journée n’a été lue, et ne dit rien', async () => {
    api.view = null;
    const { gestures, day } = build();
    await day.load();

    await gestures.record(BAGUETTE, 40);
    await gestures.markDone(BAGUETTE);
    await gestures.cancel(BAGUETTE, { id: 'b1' } as WorkshopBatch);

    expect(api.batches).toEqual([]);
    expect(api.dones).toEqual([]);
    expect(api.cancels).toEqual([]);
    expect(feedback.accepted_).toEqual([]);
    expect(feedback.refused_).toEqual([]);
    expect(gestures.refused()).toBeNull();
    expect(gestures.last()).toBeNull();
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });

  // 🔴 Le réseau coupé : le serveur a peut-être écrit, on ne le sait pas.
  it('sans réponse, garde la fournée dans la file et rejoue la MÊME clé au réappui', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = offline();

    await gestures.record(BAGUETTE, 40);

    const kept = outbox.findBatch(DAY, 'BAG', 40);
    expect(kept).toMatchObject({ kind: 'batch', quantity: 40, initials: 'MJ' });
    expect(gestures.refused()).toBe(
      `La fournée n’a pas été enregistrée — Baguette tradition : ${BATCH_KEPT}`,
    );
    expect(feedback.refused_).toHaveLength(1);
    // Gardée n'est pas acceptée : pas de « dernière », pas de relecture.
    expect(gestures.last()).toBeNull();
    expect(api.reads).toBe(1);
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
    expect(outbox.pendingOf(DAY, 'BAG')).toEqual({ quantity: 40, state: 'queued' });

    api.writeError = null;
    await gestures.record(BAGUETTE, 40);

    expect(api.batches).toHaveLength(2);
    expect(api.batches[1]?.id).toBe(kept?.id);
    expect(outbox.entries()).toEqual([]);
    expect(gestures.last()?.id).toBe(kept?.id);
  });

  it('une autre quantité sur la même ligne est une autre fournée, avec sa propre clé', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = offline();
    await gestures.record(BAGUETTE, 40);
    const kept = outbox.findBatch(DAY, 'BAG', 40);

    api.writeError = null;
    await gestures.record(BAGUETTE, 80);

    expect(api.batches[1]?.id).not.toBe(kept?.id);
    // La fournée de 40 attend toujours : rien ne l'a effacée.
    expect(outbox.findBatch(DAY, 'BAG', 40)?.id).toBe(kept?.id);
  });

  // Le serveur a répondu non : rien n'a été écrit, il n'y a rien à rejouer.
  it('sur un refus 409, ne garde rien, dit la raison du serveur et laisse la ligne armée', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = refusal409('Le plafond de la ligne est atteint.');

    await gestures.record(BAGUETTE, 40);

    expect(outbox.entries()).toEqual([]);
    expect(gestures.refused()).toBe(
      'La fournée n’a pas été enregistrée — Baguette tradition : Le plafond de la ligne est atteint.',
    );
    expect(feedback.refused_).toEqual([gestures.refused()]);
    expect(feedback.accepted_).toEqual([]);
    expect(gestures.last()).toBeNull();
    expect(api.reads).toBe(1);
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
    expect(outbox.pendingOf(DAY, 'BAG')).toBeNull();
  });

  it('efface le refus précédent au geste suivant', async () => {
    const { gestures, day } = build();
    await day.load();
    api.writeError = refusal409('Non.');
    await gestures.record(BAGUETTE, 40);
    expect(gestures.refused()).not.toBeNull();

    api.writeError = null;
    await gestures.record(BAGUETTE, 40);

    expect(gestures.refused()).toBeNull();
  });

  it('une relecture qui échoue après l’écriture ne défait pas la fournée acceptée', async () => {
    const { gestures, day } = build();
    await day.load();
    api.view = null;

    await gestures.record(BAGUETTE, 40);

    expect(gestures.last()?.quantity).toBe(40);
    expect(day.refreshFailed()).toBe(true);
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });

  // La date est prise UNE fois : une relecture qui change de journée pendant
  // l'envoi ne doit pas laisser la ligne de la veille désarmée.
  it('libère la ligne de la journée où le geste est parti, même si la fiche a tourné entre-temps', async () => {
    const { gestures, day } = build();
    await day.load();
    api.view = sheet(NEXT_DAY);

    await gestures.record(BAGUETTE, 40);

    expect(api.batches[0]?.date).toBe(DAY);
    expect(day.date()).toBe(NEXT_DAY);
    expect(day.busy().has(markKey(DAY, 'BAG'))).toBe(false);
    expect(day.busy().size).toBe(0);
  });
});

describe('WorkshopGestures — « Fait »', () => {
  it('déclare sous une clé, relit et dit « faite »', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.markDone(BAGUETTE);

    expect(api.dones).toHaveLength(1);
    expect(api.dones[0]).toMatchObject({ date: DAY, sku: 'BAG' });
    expect(api.reads).toBe(2);
    expect(feedback.accepted_).toEqual(['Baguette tradition : faite']);
    expect(gestures.last()).toBeNull();
  });

  it('un double appui n’envoie qu’un « Fait »', async () => {
    const { gestures, day } = build();
    await day.load();
    api.holdWrites = true;

    const first = gestures.markDone(BAGUETTE);
    await tick();
    await gestures.markDone(BAGUETTE);
    api.release();
    await first;

    expect(api.dones).toHaveLength(1);
  });

  // Un refus garde l'intention : l'API rend la réponse d'origine à la même clé.
  it('après un refus, le réessai repart sous la MÊME clé et ne garde rien en file', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = refusal409('Rien à déclarer.');

    await gestures.markDone(BAGUETTE);

    expect(outbox.entries()).toEqual([]);
    expect(gestures.refused()).toBe(
      'La ligne n’a pas été marquée faite — Baguette tradition : Rien à déclarer.',
    );

    api.writeError = null;
    await gestures.markDone(BAGUETTE);

    expect(api.dones).toHaveLength(2);
    expect(api.dones[1]?.key).toBe(api.dones[0]?.key);
  });

  it('sans réponse, garde le « Fait » sous sa clé, et le réappui la rejoue puis la vide', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = offline();

    await gestures.markDone(BAGUETTE);

    const kept = outbox.findDone(DAY, 'BAG');
    expect(kept).toMatchObject({ kind: 'done', id: api.dones[0]?.key });
    expect(gestures.refused()).toContain(DONE_KEPT);
    expect(outbox.doneWaiting(DAY, 'BAG')).toBe(true);

    api.writeError = null;
    await gestures.markDone(BAGUETTE);

    expect(api.dones[1]?.key).toBe(kept?.id);
    expect(outbox.entries()).toEqual([]);
  });

  it('une fois abouti, le « Fait » suivant est une intention neuve', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.markDone(BAGUETTE);
    await gestures.markDone(BAGUETTE);

    expect(api.dones).toHaveLength(2);
    expect(api.dones[1]?.key).not.toBe(api.dones[0]?.key);
  });

  it('deux lignes ont deux clés', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.markDone(BAGUETTE);
    await gestures.markDone(SEIGLE);

    expect(api.dones[0]?.key).not.toBe(api.dones[1]?.key);
  });
});

describe('WorkshopGestures — annuler', () => {
  it('« Annuler la dernière » sans dernière ne part pas et ne dit rien', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.undoLast();

    expect(api.cancels).toEqual([]);
    expect(feedback.accepted_).toEqual([]);
    expect(feedback.refused_).toEqual([]);
    expect(api.reads).toBe(1);
  });

  it('« Annuler la dernière » annule la fournée tirée, oublie `last` et relit', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);
    const id = gestures.last()?.id;

    await gestures.undoLast();

    expect(api.cancels).toEqual([{ date: DAY, id }]);
    expect(gestures.last()).toBeNull();
    expect(feedback.accepted_.at(-1)).toBe('Fournée annulée — Baguette tradition');
    // Un second appui n'annule pas deux fois.
    await gestures.undoLast();
    expect(api.cancels).toHaveLength(1);
  });

  it('« Annuler la dernière » refusée se dit, et ne laisse pas la ligne désarmée', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);
    api.writeError = refusal409('Déjà consommée.');

    await gestures.undoLast();

    expect(gestures.refused()).toBe(
      'La fournée n’a pas été annulée — Baguette tradition : Déjà consommée.',
    );
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });

  /**
   * Régression : la dernière fournée était oubliée AVANT l'envoi ; refusée,
   * l'annulation disparaissait du bandeau.
   */
  it('« Annuler la dernière » refusée garde la fournée annulable, et le réessai passe', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);
    const id = gestures.last()?.id;
    api.writeError = refusal409('Déjà consommée.');

    await gestures.undoLast();
    expect(gestures.last()?.id).toBe(id);

    api.writeError = null;
    await gestures.undoLast();
    expect(gestures.last()).toBeNull();
    expect(api.cancels.map((cancel) => cancel.id)).toEqual([id, id]);
  });

  it('annuler la fournée même qui est la dernière oublie `last`', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);
    const id = gestures.last()?.id ?? '';

    await gestures.cancel(BAGUETTE, { id } as WorkshopBatch);

    expect(gestures.last()).toBeNull();
    expect(api.cancels).toEqual([{ date: DAY, id }]);
  });

  it('annuler une AUTRE fournée garde `last` en place', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);
    const last = gestures.last();

    await gestures.cancel(BAGUETTE, { id: 'une-autre' } as WorkshopBatch);

    expect(gestures.last()).toEqual(last);
    expect(api.cancels).toEqual([{ date: DAY, id: 'une-autre' }]);
  });

  it('`forgetLast` retire la dernière sans rien envoyer', async () => {
    const { gestures, day } = build();
    await day.load();
    await gestures.record(BAGUETTE, 40);

    gestures.forgetLast();
    await gestures.undoLast();

    expect(gestures.last()).toBeNull();
    expect(api.cancels).toEqual([]);
  });

  it('une annulation sans réponse ne se garde pas dans la file : seules fournées et « Fait » y vont', async () => {
    const { gestures, day, outbox } = build();
    await day.load();
    api.writeError = offline();

    await gestures.cancel(BAGUETTE, { id: 'b1' } as WorkshopBatch);

    expect(outbox.entries()).toEqual([]);
    expect(gestures.refused()).toContain('Le serveur n’a pas répondu');
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });
});

describe('WorkshopGestures — « Problème »', () => {
  it('sans journée lue, n’ouvre rien', async () => {
    api.view = null;
    const { gestures, day } = build();
    await day.load();

    await gestures.reportProblem(BAGUETTE);

    expect(opener.opened).toEqual([]);
  });

  it('occupe la ligne tant que le panneau est ouvert : un second appui n’en ouvre pas un autre', async () => {
    const { gestures, day } = build();
    await day.load();
    opener.hold = true;

    const first = gestures.reportProblem(BAGUETTE);
    await tick();
    expect(gestures.isBusy(BAGUETTE)).toBe(true);
    await gestures.reportProblem(BAGUETTE);
    expect(opener.opened).toHaveLength(1);
    // Un geste sur la ligne ouverte est ignoré aussi.
    await gestures.markDone(BAGUETTE);
    expect(api.dones).toEqual([]);

    opener.close();
    await first;
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });

  it('un signalement pris relit la fiche ; un panneau fermé sans envoi ne relit pas', async () => {
    const { gestures, day } = build();
    await day.load();

    opener.answer = false;
    await gestures.reportProblem(BAGUETTE);
    expect(api.reads).toBe(1);

    opener.answer = true;
    await gestures.reportProblem(BAGUETTE);
    expect(api.reads).toBe(2);
    expect(opener.opened).toEqual([
      { date: DAY, sku: 'BAG' },
      { date: DAY, sku: 'BAG' },
    ]);
  });

  /**
   * Régression : un panneau en échec laissait remonter son erreur, rejet de
   * promesse que l'écran n'attrapait pas.
   */
  it('un panneau en échec est dit, sans erreur qui remonte, et la ligne est libérée', async () => {
    const { gestures, day } = build();
    await day.load();
    opener.failure = refusal409('Signalement refusé.');

    await expect(gestures.reportProblem(BAGUETTE)).resolves.toBeUndefined();

    expect(gestures.refused()).toBe(
      'Le problème n’a pas pu être signalé — Baguette tradition : Signalement refusé.',
    );
    expect(feedback.refused_.at(-1)).toBe(gestures.refused());
    expect(gestures.isBusy(BAGUETTE)).toBe(false);
  });
});

describe('WorkshopGestures — les étapes', () => {
  const SANDWICH = line({ sku: 'SAN', productName: 'Sandwich', role: 'step' });

  it('« Étape faite » vise le poste, sous une clé, relit et le dit', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.markStepDone(SANDWICH, 'ws_b');

    expect(api.steps).toEqual([
      { gesture: 'done', sku: 'SAN', station: 'ws_b', key: expect.any(String) },
    ]);
    expect(api.reads).toBe(2);
    expect(feedback.accepted_).toEqual(['Sandwich : étape faite']);
    expect(day.busy().size).toBe(0);
  });

  it('après un refus, le réessai repart sous la MÊME clé ; abouti, le suivant est neuf', async () => {
    const { gestures, day } = build();
    await day.load();
    api.writeError = refusal409('Ce poste finit la ligne.');

    await gestures.markStepDone(SANDWICH, 'ws_b');
    expect(gestures.refused()).toContain('Ce poste finit la ligne.');
    api.writeError = null;
    await gestures.markStepDone(SANDWICH, 'ws_b');
    await gestures.markStepDone(SANDWICH, 'ws_b');

    const keys = api.steps.map((step) => step.key);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('décocher a sa propre clé', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.markStepDone(SANDWICH, 'ws_b');
    await gestures.undoStep(SANDWICH, 'ws_b');

    expect(api.steps.map((step) => step.gesture)).toEqual(['done', 'undo']);
    expect(api.steps[1]?.key).not.toBe(api.steps[0]?.key);
  });

  it('le rouge d’une étape ouvre son panneau sur le poste, et relit s’il est pris', async () => {
    const { gestures, day } = build();
    await day.load();
    opener.answer = true;

    await gestures.reportStepRed(SANDWICH, 'ws_b');

    expect(opener.stepReds).toEqual([{ sku: 'SAN', station: 'ws_b' }]);
    expect(api.reads).toBe(2);
    expect(day.busy().size).toBe(0);
  });
});

describe('WorkshopGestures — refus venu d’ailleurs et retirage', () => {
  it('`sayRefused` garde le refus et le fait sentir', async () => {
    const { gestures } = build();

    gestures.sayRefused('La file a été refusée.');

    expect(gestures.refused()).toBe('La file a été refusée.');
    expect(feedback.refused_).toEqual(['La file a été refusée.']);
  });

  it('retirer sans journée lue ne part pas', async () => {
    api.view = null;
    const { gestures, day } = build();
    await day.load();

    await gestures.retake();

    expect(api.retakes).toEqual([]);
    expect(gestures.retakeFailed()).toBe(false);
  });

  it('retirer absorbe puis relit la fiche', async () => {
    const { gestures, day } = build();
    await day.load();

    await gestures.retake();

    expect(api.retakes).toEqual([DAY]);
    expect(api.reads).toBe(2);
    expect(gestures.retakeFailed()).toBe(false);
  });

  it('un retirage en échec le dit, ne relit pas, et se réarme au réessai', async () => {
    const { gestures, day } = build();
    await day.load();
    api.retakeError = refusal409('Non.');

    await gestures.retake();

    expect(gestures.retakeFailed()).toBe(true);
    expect(api.reads).toBe(1);

    api.retakeError = null;
    await gestures.retake();

    expect(gestures.retakeFailed()).toBe(false);
    expect(api.reads).toBe(2);
  });
});
