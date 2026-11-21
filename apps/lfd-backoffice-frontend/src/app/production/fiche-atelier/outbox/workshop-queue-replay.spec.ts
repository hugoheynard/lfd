import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordWorkshopBatch } from '@lfd/contracts';

import { GestureFeedback } from '../../../shared/gesture-feedback/gesture-feedback';
import { markKey } from '../../worksheet-day';
import { WorksheetService } from '../../worksheet.service';
import { WorkshopDayReader } from '../state/workshop-day.reader';
import { WorkshopGestures } from '../state/workshop-gestures';
import { type QueuedBatch, type QueuedDone, WorkshopOutbox } from './workshop-outbox';
import { WorkshopQueueReplay } from './workshop-queue-replay';

const STORAGE_KEY = 'lfd.workshop.outbox.v2';

function batch(over: Partial<QueuedBatch> = {}): QueuedBatch {
  return {
    kind: 'batch',
    id: '01J0000000000000000000000A',
    date: '2026-11-20',
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 30,
    initials: 'HH',
    ...over,
  };
}

function done(over: Partial<QueuedDone> = {}): QueuedDone {
  return {
    kind: 'done',
    id: '01J0000000000000000000000D',
    date: '2026-11-20',
    sku: 'PAN',
    productName: 'Pain de campagne',
    ...over,
  };
}

const SILENCE = new HttpErrorResponse({ status: 0 });

function refusal(message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code: 'conflict', message } });
}

/** Un appel reçu par le serveur double, dans l'ordre où il est arrivé. */
interface Call {
  readonly kind: 'batch' | 'done';
  readonly date: string;
  readonly sku: string;
  readonly key: string;
  readonly payload: RecordWorkshopBatch | null;
}

/**
 * Le serveur double : répond selon la clé du geste (succès par défaut), et note
 * ce que la file lui a montré de la ligne au moment de l'appel.
 */
class ScriptedWorksheetService extends WorksheetService {
  readonly calls: Call[] = [];
  readonly outcomes = new Map<string, HttpErrorResponse | Error>();
  /** Si posé, chaque appel attend cette promesse avant de répondre. */
  gate: Promise<void> | null = null;
  /** Une relecture de la file pendant l'appel : ce que la fiche affiche de la ligne. */
  onCall: (call: Call) => void = () => undefined;

  override async recordBatch(
    date: string,
    sku: string,
    batchId: string,
    payload: RecordWorkshopBatch,
  ): Promise<void> {
    await this.answer({ kind: 'batch', date, sku, key: batchId, payload });
  }

  override async markDone(date: string, sku: string, intentKey: string): Promise<void> {
    await this.answer({ kind: 'done', date, sku, key: intentKey, payload: null });
  }

  private async answer(call: Call): Promise<void> {
    this.calls.push(call);
    this.onCall(call);
    if (this.gate !== null) {
      await this.gate;
    }
    const outcome = this.outcomes.get(call.key);
    if (outcome !== undefined) {
      throw outcome;
    }
  }
}

/** La lecture de la fiche : la vraie occupation des lignes, une relecture comptée. */
class CountingDayReader extends WorkshopDayReader {
  rereads = 0;

  override async rereadAfterWrite(): Promise<boolean> {
    this.rereads += 1;
    return true;
  }
}

/** Le retour sonore et tactile : noté, jamais joué. */
class RecordingFeedback extends GestureFeedback {
  readonly accepted_: string[] = [];
  readonly refused_: string[] = [];

  override accepted(message: string): void {
    this.accepted_.push(message);
  }

  override refused(message: string): void {
    this.refused_.push(message);
  }
}

/** Les gestes de l'écran : le renvoi n'en appelle que le refus dit. */
class RecordingGestures {
  readonly said: string[] = [];

  sayRefused(said: string): void {
    this.said.push(said);
  }
}

interface Setup {
  readonly replay: WorkshopQueueReplay;
  readonly outbox: WorkshopOutbox;
  readonly api: ScriptedWorksheetService;
  readonly day: CountingDayReader;
  readonly feedback: RecordingFeedback;
  readonly gestures: RecordingGestures;
}

function setup(queued: readonly (QueuedBatch | QueuedDone)[] = []): Setup {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      WorkshopOutbox,
      WorkshopQueueReplay,
      { provide: WorksheetService, useClass: ScriptedWorksheetService },
      { provide: WorkshopDayReader, useClass: CountingDayReader },
      { provide: WorkshopGestures, useClass: RecordingGestures },
      { provide: GestureFeedback, useClass: RecordingFeedback },
    ],
  });
  const outbox = TestBed.inject(WorkshopOutbox);
  queued.forEach((entry) => outbox.add(entry));
  const api = TestBed.inject(WorksheetService);
  const day = TestBed.inject(WorkshopDayReader);
  const feedback = TestBed.inject(GestureFeedback);
  const gestures = TestBed.inject(WorkshopGestures);
  if (
    !(api instanceof ScriptedWorksheetService) ||
    !(day instanceof CountingDayReader) ||
    !(feedback instanceof RecordingFeedback) ||
    !(gestures instanceof RecordingGestures)
  ) {
    throw new Error('Les doublures ne sont pas celles que le test a posées.');
  }
  return { replay: TestBed.inject(WorkshopQueueReplay), outbox, api, day, feedback, gestures };
}

/** Une promesse qu'on ouvre à la main : le serveur « qui n'a pas encore répondu ». */
function opening(): { readonly promise: Promise<void>; readonly open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

beforeEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('le renvoi de la file d’envoi', () => {
  describe('un tour', () => {
    it('ne fait rien d’une file vide : ni appel, ni relecture, ni retour', async () => {
      const { replay, api, day, feedback } = setup();

      await replay.flush();

      expect(api.calls).toEqual([]);
      expect(day.rereads).toBe(0);
      expect(feedback.accepted_).toEqual([]);
    });

    it('renvoie les gestes dans l’ordre où ils ont été gardés, chacun sous sa clé', async () => {
      const first = batch({ id: 'K1', quantity: 12 });
      const second = done({ id: 'K2' });
      const third = batch({ id: 'K3', sku: 'BAG', quantity: 40, initials: 'AB' });
      const { replay, api, outbox } = setup([first, second, third]);

      await replay.flush();

      expect(api.calls).toEqual([
        {
          kind: 'batch',
          date: '2026-11-20',
          sku: 'CRO',
          key: 'K1',
          payload: { quantity: 12, initials: 'HH' },
        },
        { kind: 'done', date: '2026-11-20', sku: 'PAN', key: 'K2', payload: null },
        {
          kind: 'batch',
          date: '2026-11-20',
          sku: 'BAG',
          key: 'K3',
          payload: { quantity: 40, initials: 'AB' },
        },
      ]);
      expect(outbox.entries()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('rejoue un « Fait » sous sa clé d’intention, sans quantité', async () => {
      const { replay, api } = setup([done({ id: 'INTENT-1' })]);

      await replay.flush();

      expect(api.calls).toEqual([
        { kind: 'done', date: '2026-11-20', sku: 'PAN', key: 'INTENT-1', payload: null },
      ]);
    });

    it('montre la fournée « en cours d’envoi » pendant l’appel, puis plus rien', async () => {
      const { replay, api, outbox } = setup([batch({ id: 'K1', quantity: 12 })]);
      const seen: unknown[] = [];
      api.onCall = (call) => seen.push(outbox.pendingOf(call.date, call.sku));

      await replay.flush();

      expect(seen).toEqual([{ quantity: 12, state: 'sending' }]);
      expect(outbox.pendingOf('2026-11-20', 'CRO')).toBeNull();
    });

    it('relit la fiche une fois, et le dit, quand au moins un geste est parti', async () => {
      const { replay, day, feedback } = setup([batch({ id: 'K1' }), done({ id: 'K2' })]);

      await replay.flush();

      expect(day.rereads).toBe(1);
      expect(feedback.accepted_).toEqual(['Gestes gardés envoyés']);
    });
  });

  describe('le silence du réseau', () => {
    it('arrête le tour au premier silence et garde ce geste et tout le reste', async () => {
      const first = batch({ id: 'K1' });
      const second = done({ id: 'K2' });
      const third = batch({ id: 'K3', sku: 'BAG' });
      const { replay, api, outbox, day, feedback } = setup([first, second, third]);
      api.outcomes.set('K2', SILENCE);

      await replay.flush();

      // K3 n'est même pas tentée : le réseau n'est pas revenu.
      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K2']);
      expect(outbox.entries()).toEqual([second, third]);
      // Ce qui est parti avant le silence a bien changé la fiche : on la relit.
      expect(day.rereads).toBe(1);
      expect(feedback.accepted_).toEqual(['Gestes gardés envoyés']);
    });

    it('ne relit rien, ne dit rien et garde la file quand le premier geste est muet', async () => {
      const first = batch({ id: 'K1' });
      const second = done({ id: 'K2' });
      const { replay, api, outbox, day, feedback, gestures } = setup([first, second]);
      api.outcomes.set('K1', SILENCE);

      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K1']);
      expect(outbox.entries()).toEqual([first, second]);
      expect(day.rereads).toBe(0);
      expect(feedback.accepted_).toEqual([]);
      // Un silence n'est pas un refus : rien n'est dit comme refusé.
      expect(gestures.said).toEqual([]);
    });

    it('libère la ligne et le tour après un silence : le tour suivant repart', async () => {
      const { replay, api, outbox, day } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', SILENCE);
      await replay.flush();
      expect(day.busy().has(markKey('2026-11-20', 'CRO'))).toBe(false);
      expect(outbox.pendingOf('2026-11-20', 'CRO')).toEqual({ quantity: 30, state: 'queued' });

      api.outcomes.clear();
      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K1']);
      expect(outbox.entries()).toEqual([]);
    });
  });

  describe('un refus du serveur', () => {
    it('retire la fournée de la file et dit pourquoi, avec les mots du serveur', async () => {
      const { replay, api, outbox, gestures } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', refusal('Conflit : la clé a déjà servi pour 20 pièces.'));

      await replay.flush();

      expect(outbox.entries()).toEqual([]);
      expect(gestures.said).toEqual([
        'La fournée gardée n’a pas été acceptée — Croissant : Conflit : la clé a déjà servi pour 20 pièces.',
      ]);
    });

    it('accorde le refus d’un « Fait » au masculin', async () => {
      const { replay, api, outbox, gestures } = setup([done({ id: 'K2' })]);
      api.outcomes.set('K2', refusal('La ligne est déjà au plafond.'));

      await replay.flush();

      expect(outbox.entries()).toEqual([]);
      expect(gestures.said).toEqual([
        'Le « Fait » gardé n’a pas été accepté — Pain de campagne : La ligne est déjà au plafond.',
      ]);
    });

    it('ne rejoue pas un geste refusé : un second tour ne le renvoie pas', async () => {
      const { replay, api } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', refusal('Non.'));

      await replay.flush();
      await replay.flush();

      expect(api.calls).toHaveLength(1);
    });

    it('continue le tour après un refus : les gestes suivants partent', async () => {
      const second = done({ id: 'K2' });
      const { replay, api, outbox, day } = setup([batch({ id: 'K1' }), second]);
      api.outcomes.set('K1', refusal('Non.'));

      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K2']);
      expect(outbox.entries()).toEqual([]);
      expect(day.rereads).toBe(1);
    });

    it('ne relit pas la fiche et ne se félicite pas quand tout a été refusé', async () => {
      const { replay, api, day, feedback, gestures } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', refusal('Non.'));

      await replay.flush();

      expect(day.rereads).toBe(0);
      expect(feedback.accepted_).toEqual([]);
      expect(gestures.said).toHaveLength(1);
    });

    it('traite une erreur qui n’est pas HTTP comme un refus, avec le message neutre', async () => {
      const { replay, api, outbox, gestures } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', new Error('boum'));

      await replay.flush();

      expect(outbox.entries()).toEqual([]);
      expect(gestures.said).toEqual([
        'La fournée gardée n’a pas été acceptée — Croissant : Le serveur n’a pas enregistré ce geste.',
      ]);
    });
  });

  describe('une ligne occupée', () => {
    it('saute la ligne dont un geste est en vol et garde son geste en file', async () => {
      const busyBatch = batch({ id: 'K1' });
      const { replay, api, outbox, day } = setup([busyBatch, done({ id: 'K2' })]);
      day.setBusy(markKey('2026-11-20', 'CRO'), true);

      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K2']);
      expect(outbox.entries()).toEqual([busyBatch]);
      // Sauter une ligne n'est pas un silence : le reste du tour a eu lieu, et la ligne
      // occupée reste occupée — ce n'est pas au renvoi de la libérer.
      expect(day.busy().has(markKey('2026-11-20', 'CRO'))).toBe(true);
      expect(day.rereads).toBe(1);
    });

    it('ne relit rien quand toutes les lignes sont occupées', async () => {
      const { replay, api, day, feedback } = setup([batch({ id: 'K1' })]);
      day.setBusy(markKey('2026-11-20', 'CRO'), true);

      await replay.flush();

      expect(api.calls).toEqual([]);
      expect(day.rereads).toBe(0);
      expect(feedback.accepted_).toEqual([]);
    });

    it('occupe la ligne pendant l’envoi seulement, et la libère ensuite', async () => {
      const { replay, api, day } = setup([batch({ id: 'K1' })]);
      const key = markKey('2026-11-20', 'CRO');
      const during: boolean[] = [];
      api.onCall = () => during.push(day.busy().has(key));

      await replay.flush();

      expect(during).toEqual([true]);
      expect(day.busy().has(key)).toBe(false);
    });

    it('ne confond pas deux jours : le même SKU un autre jour n’est pas occupé', async () => {
      const { replay, api, day } = setup([batch({ id: 'K1', date: '2026-11-21' })]);
      day.setBusy(markKey('2026-11-20', 'CRO'), true);

      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K1']);
    });
  });

  describe('un seul tour à la fois', () => {
    it('ignore un tour demandé pendant un tour, sans doubler aucun envoi', async () => {
      const { replay, api, day } = setup([batch({ id: 'K1' }), done({ id: 'K2' })]);
      const gate = opening();
      api.gate = gate.promise;

      const first = replay.flush();
      await replay.flush();
      // Le tour concurrent a rendu la main sans rien envoyer : seul le premier appel a eu lieu.
      expect(api.calls.map((call) => call.key)).toEqual(['K1']);

      gate.open();
      await first;

      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K2']);
      expect(day.rereads).toBe(1);
    });

    it('rouvre le tour une fois fini : un geste gardé ensuite repart', async () => {
      const { replay, api, outbox } = setup([batch({ id: 'K1' })]);
      await replay.flush();

      outbox.add(done({ id: 'K2' }));
      await replay.flush();

      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K2']);
    });
  });

  describe('le libellé du bandeau', () => {
    it('est nul quand la file est vide', () => {
      expect(setup().replay.queuedLabel()).toBeNull();
    });

    it('dit « 1 fournée » au singulier', () => {
      expect(setup([batch()]).replay.queuedLabel()).toBe('1 fournée');
    });

    it('met « fournées » au pluriel', () => {
      const { replay } = setup([batch({ id: 'A' }), batch({ id: 'B', sku: 'BAG' })]);
      expect(replay.queuedLabel()).toBe('2 fournées');
    });

    it('compte les « Fait » sans pluriel, jamais « Faits »', () => {
      expect(setup([done({ id: 'A' })]).replay.queuedLabel()).toBe('1 « Fait »');
      TestBed.resetTestingModule();
      const { replay } = setup([done({ id: 'A' }), done({ id: 'B', sku: 'BAG' })]);
      expect(replay.queuedLabel()).toBe('2 « Fait »');
    });

    it('joint fournées et « Fait » : « 2 fournées et 1 « Fait » »', () => {
      const { replay } = setup([
        batch({ id: 'A' }),
        done({ id: 'B' }),
        batch({ id: 'C', sku: 'BAG' }),
      ]);
      expect(replay.queuedLabel()).toBe('2 fournées et 1 « Fait »');
    });

    it('suit la file : il s’éteint quand le dernier geste est parti', async () => {
      const { replay } = setup([batch()]);
      expect(replay.queuedLabel()).toBe('1 fournée');

      await replay.flush();

      expect(replay.queuedLabel()).toBeNull();
    });
  });

  describe('les relances armées par start()', () => {
    function start(replay: WorkshopQueueReplay): void {
      TestBed.inject(EnvironmentInjector).runInContext(() => replay.start());
    }

    it('renvoie la file dès l’ouverture', async () => {
      const { replay, api } = setup([batch({ id: 'K1' })]);

      start(replay);

      await vi.waitFor(() => expect(api.calls.map((call) => call.key)).toEqual(['K1']));
    });

    it('renvoie au retour du réseau (événement online)', async () => {
      const { replay, api, outbox } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', SILENCE);
      start(replay);
      await vi.waitFor(() => expect(api.calls).toHaveLength(1));
      await vi.waitFor(() => expect(outbox.pendingOf('2026-11-20', 'CRO')?.state).toBe('queued'));

      api.outcomes.clear();
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(outbox.entries()).toEqual([]));
      expect(api.calls.map((call) => call.key)).toEqual(['K1', 'K1']);
    });

    it('renvoie à chaque relecture visible (toutes les 15 s)', async () => {
      vi.useFakeTimers();
      const { replay, api, outbox } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', SILENCE);
      start(replay);
      await vi.advanceTimersByTimeAsync(0);
      expect(api.calls).toHaveLength(1);

      api.outcomes.clear();
      await vi.advanceTimersByTimeAsync(15_000);

      expect(api.calls).toHaveLength(2);
      expect(outbox.entries()).toEqual([]);
    });

    it('renvoie quand l’onglet redevient visible', async () => {
      const { replay, api, outbox } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', SILENCE);
      start(replay);
      await vi.waitFor(() => expect(api.calls).toHaveLength(1));
      await vi.waitFor(() => expect(outbox.pendingOf('2026-11-20', 'CRO')?.state).toBe('queued'));

      api.outcomes.clear();
      document.dispatchEvent(new Event('visibilitychange'));

      await vi.waitFor(() => expect(outbox.entries()).toEqual([]));
    });

    it('n’écoute plus ni le réseau ni le temps une fois l’écran détruit', async () => {
      vi.useFakeTimers();
      const { replay, api, outbox } = setup([batch({ id: 'K1' })]);
      api.outcomes.set('K1', SILENCE);
      start(replay);
      await vi.advanceTimersByTimeAsync(0);
      expect(api.calls).toHaveLength(1);
      api.outcomes.clear();

      TestBed.resetTestingModule();
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60_000);

      expect(api.calls).toHaveLength(1);
      expect(outbox.entries()).toHaveLength(1);
    });
  });
});
