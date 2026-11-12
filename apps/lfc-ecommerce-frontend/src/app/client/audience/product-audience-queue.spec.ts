import { MAX_AUDIENCE_EVENTS_PER_BATCH } from '@lfd/contracts/shop-values';

import {
  AUDIENCE_FLUSH_DELAY_MS,
  type AudienceTimer,
  type AudienceTransport,
  ProductAudienceQueue,
} from './product-audience-queue';

class RecordingTransport implements AudienceTransport {
  readonly sent: string[] = [];
  readonly onLeave: string[] = [];
  send(body: string): void {
    this.sent.push(body);
  }
  sendOnLeave(body: string): void {
    this.onLeave.push(body);
  }
}

class ManualTimer implements AudienceTimer {
  readonly runs: (() => void)[] = [];
  delays: number[] = [];
  schedule(run: () => void, delayMs: number): void {
    this.runs.push(run);
    this.delays.push(delayMs);
  }
  fire(): void {
    this.runs.splice(0).forEach((run) => run());
  }
}

/** Des identifiants de lot prévisibles : `lot-1`, `lot-2`… */
function sequence(): () => string {
  let next = 0;
  return () => `lot-${(next += 1)}`;
}

describe('ProductAudienceQueue', () => {
  it('porte la source et l’emplacement d’un geste de suggestion', () => {
    const transport = new RecordingTransport();
    const timer = new ManualTimer();
    const queue = new ProductAudienceQueue(transport, timer, sequence());

    queue.record('PAI-001', 'suggestion_shown', { source: 'staff', placement: '01jrule' });
    timer.fire();

    expect(transport.sent.map((body) => JSON.parse(body))).toEqual([
      {
        events: [
          { sku: 'PAI-001', event: 'suggestion_shown', source: 'staff', placement: '01jrule' },
        ],
        batchId: 'lot-1',
      },
    ]);
  });

  it('regroupe les gestes et les envoie en UN lot, une fois le délai écoulé', () => {
    const transport = new RecordingTransport();
    const timer = new ManualTimer();
    const queue = new ProductAudienceQueue(transport, timer, sequence());

    queue.record('VIE-001', 'product_viewed');
    queue.record('VIE-001', 'added_to_cart');
    expect(transport.sent).toEqual([]);
    expect(timer.delays).toEqual([AUDIENCE_FLUSH_DELAY_MS]);

    timer.fire();
    expect(transport.sent.map((body) => JSON.parse(body))).toEqual([
      {
        events: [
          { sku: 'VIE-001', event: 'product_viewed', source: 'none' },
          { sku: 'VIE-001', event: 'added_to_cart', source: 'none' },
        ],
        batchId: 'lot-1',
      },
    ]);
  });

  it("n'envoie rien quand la file est vide", () => {
    const transport = new RecordingTransport();
    const queue = new ProductAudienceQueue(transport, new ManualTimer(), sequence());

    queue.flush(true);
    expect(transport.sent).toEqual([]);
    expect(transport.onLeave).toEqual([]);
  });

  it('part tout de suite quand le lot est plein — le serveur refuse un lot trop gros', () => {
    const transport = new RecordingTransport();
    const queue = new ProductAudienceQueue(transport, new ManualTimer(), sequence());

    for (let i = 0; i < MAX_AUDIENCE_EVENTS_PER_BATCH; i += 1) {
      queue.record('VIE-001', 'product_viewed');
    }
    expect(transport.sent).toHaveLength(1);
  });

  it('vide ce qui reste par balise au départ de la page', () => {
    const transport = new RecordingTransport();
    const queue = new ProductAudienceQueue(transport, new ManualTimer(), sequence());

    queue.record('VIE-002', 'product_viewed');
    queue.flush(true);
    expect(transport.sent).toEqual([]);
    expect(transport.onLeave).toHaveLength(1);
  });

  // Un lot porte son identifiant : le serveur reconnaît sa copie rejouée par le réseau.
  it('tire un identifiant neuf pour chaque lot, même aux gestes identiques', () => {
    const transport = new RecordingTransport();
    const timer = new ManualTimer();
    const queue = new ProductAudienceQueue(transport, timer, sequence());

    queue.record('VIE-001', 'product_viewed');
    timer.fire();
    queue.record('VIE-001', 'product_viewed');
    timer.fire();

    expect(transport.sent.map((body) => JSON.parse(body).batchId)).toEqual(['lot-1', 'lot-2']);
  });
});
