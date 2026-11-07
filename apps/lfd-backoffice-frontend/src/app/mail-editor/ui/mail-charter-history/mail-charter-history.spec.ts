import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { MailChartersService } from '../../data/mail-charters.service';
import { MailCharterHistory } from './mail-charter-history';

async function setup(history: () => Promise<unknown>) {
  const api = { history: vi.fn(history) };
  TestBed.configureTestingModule({
    imports: [MailCharterHistory],
    providers: [{ provide: MailChartersService, useValue: api }],
  });
  const fixture = TestBed.createComponent(MailCharterHistory);
  fixture.componentRef.setInput('space', 'lfd');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, api };
}

describe('MailCharterHistory', () => {
  it('liste les versions, celle en service marquée', async () => {
    const { fixture, api } = await setup(() =>
      Promise.resolve({
        space: 'lfd',
        versions: [
          {
            version: 2,
            current: true,
            at: '2026-11-07T08:00:00.000Z',
            staffId: 's1',
            settings: {},
          },
          {
            version: 1,
            current: false,
            at: '2026-11-06T08:00:00.000Z',
            staffId: 's2',
            settings: {},
          },
        ],
      }),
    );
    expect(api.history).toHaveBeenCalledWith('lfd');
    expect(fixture.componentInstance.nodes().map((node) => node.label)).toEqual([
      'Version 2 — en service · publiée par s1',
      'Version 1 · publiée par s2',
    ]);
  });

  it('dit qu’elle n’a jamais été publiée', async () => {
    const { element } = await setup(() => Promise.resolve({ space: 'lfd', versions: [] }));
    expect(element.textContent).toContain('Jamais publiée');
  });

  it('dit l’échec de lecture', async () => {
    const { element } = await setup(() => Promise.reject(new Error('boom')));
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });
});
