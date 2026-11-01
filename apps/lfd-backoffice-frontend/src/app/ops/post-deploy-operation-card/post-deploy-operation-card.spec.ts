import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { PostDeployOperationView, PostDeployRunView } from '@lfd/ops-contract';

import { PostDeployService } from '../post-deploy.service';
import { PostDeployOperationCard, RUN_POLL_MS } from './post-deploy-operation-card';

const HOUR_MS = 3_600_000;
const inOneHour = (): string => new Date(Date.now() + HOUR_MS).toISOString();
const oneHourAgo = (): string => new Date(Date.now() - HOUR_MS).toISOString();

const REPORT = { writable: 3, byHand: 1, summary: ['3 politiques à poser'], sample: ['M-12'] };

function operation(overrides: Partial<PostDeployOperationView> = {}): PostDeployOperationView {
  return {
    key: 'mercuriale-policies',
    title: 'Politiques des mercuriales',
    why: 'Les mercuriales décident.',
    limit: 'Sans retour arrière ; sauvegarde avant.',
    after: [],
    toDo: true,
    blockedBy: [],
    current: REPORT,
    lastRun: null,
    ...overrides,
  };
}

function run(overrides: Partial<PostDeployRunView> = {}): PostDeployRunView {
  return {
    id: 'run-1',
    operationKey: 'mercuriale-policies',
    state: 'simulated',
    revision: 'abc',
    simulatedBy: 'staff-1',
    simulatedAt: new Date().toISOString(),
    applicableUntil: inOneHour(),
    simulation: REPORT,
    startedAt: null,
    progress: null,
    finishedAt: null,
    failure: null,
    ...overrides,
  };
}

class FakeService {
  runs: PostDeployRunView[] = [];
  simulated: string[] = [];
  applied: string[] = [];
  applyError: unknown = null;

  simulate(key: string): Promise<{ runId: string }> {
    this.simulated.push(key);
    return Promise.resolve({ runId: 'run-1' });
  }
  apply(key: string): Promise<{ runId: string }> {
    this.applied.push(key);
    if (this.applyError !== null) return Promise.reject(this.applyError);
    return Promise.resolve({ runId: 'run-1' });
  }
  run(): Promise<PostDeployRunView> {
    const next = this.runs.length > 1 ? this.runs.shift() : this.runs[0];
    return Promise.resolve(next ?? run());
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<PostDeployOperationCard>;
  readonly finished: number[];
}

async function render(
  service: FakeService,
  inputs: { operation?: PostDeployOperationView; canSimulate?: boolean; canApply?: boolean } = {},
): Promise<Rendered> {
  TestBed.configureTestingModule({
    imports: [PostDeployOperationCard],
    providers: [{ provide: PostDeployService, useValue: service }],
  });
  const fixture = TestBed.createComponent(PostDeployOperationCard);
  fixture.componentRef.setInput('operation', inputs.operation ?? operation());
  fixture.componentRef.setInput('canSimulate', inputs.canSimulate ?? true);
  fixture.componentRef.setInput('canApply', inputs.canApply ?? true);
  fixture.componentRef.setInput('titles', { 'mercuriale-policies': 'Politiques des mercuriales' });
  const finished: number[] = [];
  fixture.componentInstance.finished.subscribe(() => finished.push(1));
  await settle(fixture);
  return { fixture, finished };
}

async function settle(fixture: ComponentFixture<PostDeployOperationCard>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const q = (f: ComponentFixture<PostDeployOperationCard>, sel: string): HTMLElement | null =>
  (f.nativeElement as HTMLElement).querySelector<HTMLElement>(sel);
const text = (f: ComponentFixture<PostDeployOperationCard>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

async function click(f: ComponentFixture<PostDeployOperationCard>, sel: string): Promise<void> {
  const button = q(f, sel);
  if (button === null) throw new Error(`absent : ${sel}`);
  button.click();
  await settle(f);
  await settle(f);
}

async function acknowledge(f: ComponentFixture<PostDeployOperationCard>): Promise<void> {
  const input = q(f, '[data-acknowledge] input');
  if (!(input instanceof HTMLInputElement)) throw new Error('case « j’ai lu » absente');
  input.click();
  await settle(f);
}

describe('PostDeployOperationCard', () => {
  afterEach(() => vi.useRealTimers());

  it("montre l'état, les comptes, la limite, et pas « Appliquer » avant une simulation", async () => {
    const { fixture } = await render(new FakeService());
    expect(text(fixture)).toContain('À faire');
    expect(q(fixture, '[data-writable]')?.textContent).toContain('3');
    expect(q(fixture, '[data-by-hand]')?.textContent).toContain('1');
    expect(text(fixture)).toContain('Sans retour arrière');
    expect(text(fixture)).toContain('Jamais passée');
    expect(q(fixture, '[data-apply]')).toBeNull();
  });

  it('dit « bloquée par » avec le titre, et n’offre pas « Appliquer »', async () => {
    const service = new FakeService();
    const { fixture } = await render(service, {
      operation: operation({ key: 'order-discounts', blockedBy: ['mercuriale-policies'] }),
    });
    expect(q(fixture, '[data-blocked]')?.textContent).toContain('Politiques des mercuriales');
    await click(fixture, '[data-simulate]');
    expect(q(fixture, '[data-apply]')).toBeNull();
  });

  it('« Appliquer » apparaît après sa simulation et attend « j’ai lu »', async () => {
    const service = new FakeService();
    service.runs = [run()];
    const { fixture } = await render(service);
    await click(fixture, '[data-simulate]');
    expect(service.simulated).toEqual(['mercuriale-policies']);
    const apply = q(fixture, '[data-apply]');
    expect(apply).not.toBeNull();
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    await acknowledge(fixture);
    expect((q(fixture, '[data-apply]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('une simulation expirée n’offre plus « Appliquer », et le dit', async () => {
    const service = new FakeService();
    service.runs = [run({ applicableUntil: oneHourAgo() })];
    const { fixture } = await render(service);
    await click(fixture, '[data-simulate]');
    expect(q(fixture, '[data-apply]')).toBeNull();
    expect(q(fixture, '[data-expired]')).not.toBeNull();
  });

  it('une simulation qui ne trouve rien n’offre pas « Appliquer »', async () => {
    const service = new FakeService();
    service.runs = [run({ simulation: { ...REPORT, writable: 0 } })];
    const { fixture } = await render(service);
    await click(fixture, '[data-simulate]');
    expect(q(fixture, '[data-apply]')).toBeNull();
  });

  it('en lecture seule : « Simuler » sans « Appliquer »', async () => {
    const service = new FakeService();
    service.runs = [run()];
    const { fixture } = await render(service, { canApply: false });
    await click(fixture, '[data-simulate]');
    expect(q(fixture, '[data-apply]')).toBeNull();
  });

  it('sans droit de lecture : aucun bouton', async () => {
    const { fixture } = await render(new FakeService(), { canSimulate: false, canApply: false });
    expect(q(fixture, '[data-simulate]')).toBeNull();
  });

  it('suit l’application jusqu’à un état final, puis le signale', async () => {
    const service = new FakeService();
    service.runs = [run()];
    const { fixture, finished } = await render(service);
    await click(fixture, '[data-simulate]');
    await acknowledge(fixture);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    service.runs = [
      run({ state: 'running', progress: { ...REPORT, writable: 1 } }),
      run({ state: 'succeeded', progress: REPORT, finishedAt: new Date().toISOString() }),
    ];
    await click(fixture, '[data-apply]');
    expect(service.applied).toEqual(['mercuriale-policies']);
    expect(q(fixture, '[data-running]')).not.toBeNull();
    expect(finished).toEqual([]);

    await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    await settle(fixture);
    expect(q(fixture, '[data-final]')?.textContent).toContain('réussie');
    expect(finished).toEqual([1]);
  });

  it('un échec dit qu’on peut resimuler puis relancer', async () => {
    const service = new FakeService();
    service.runs = [run()];
    const { fixture } = await render(service);
    await click(fixture, '[data-simulate]');
    await acknowledge(fixture);
    service.runs = [run({ state: 'interrupted', failure: 'Image remplacée.', progress: REPORT })];
    await click(fixture, '[data-apply]');
    const final = q(fixture, '[data-final]')?.textContent ?? '';
    expect(final).toContain('interrompue');
    expect(final).toContain('Image remplacée.');
    expect(final).toContain('simuler de nouveau');
  });

  it('un refus du serveur se lit tel quel', async () => {
    const service = new FakeService();
    service.runs = [run()];
    service.applyError = { status: 409, error: { code: 'x', message: 'Simulez d’abord.' } };
    const { fixture } = await render(service);
    await click(fixture, '[data-simulate]');
    await acknowledge(fixture);
    await click(fixture, '[data-apply]');
    expect(q(fixture, '[data-failure]')?.textContent).toContain('Simulez d’abord.');
  });
});
