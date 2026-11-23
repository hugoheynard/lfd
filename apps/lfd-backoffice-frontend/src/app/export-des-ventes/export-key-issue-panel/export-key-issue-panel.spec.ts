import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { IssueExportReaderKeyPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { ExportKeysService } from '../export-keys.service';
import { ExportKeyIssuePanel } from './export-key-issue-panel';

const SECRET = 'lfdexp_SECRET_MONTRE_UNE_FOIS';

interface Wire {
  issues: IssueExportReaderKeyPayload[];
  closes: unknown[];
  refuse: { status: number; message: string } | null;
}

let wire: Wire;

async function boot(): Promise<ComponentFixture<ExportKeyIssuePanel>> {
  wire = { issues: [], closes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ExportKeyIssuePanel],
    providers: [
      {
        provide: ExportKeysService,
        useValue: {
          issue: (payload: IssueExportReaderKeyPayload) => {
            wire.issues.push(payload);
            return wire.refuse === null
              ? Promise.resolve({ id: 'k1', secret: SECRET })
              : Promise.reject(
                  new HttpErrorResponse({
                    status: wire.refuse.status,
                    error: { message: wire.refuse.message },
                  }),
                );
          },
        } satisfies Pick<ExportKeysService, 'issue'>,
      },
      {
        provide: NotifyService,
        useValue: { success: () => undefined, info: () => undefined },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(ExportKeyIssuePanel);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<ExportKeyIssuePanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(fixture: ComponentFixture<ExportKeyIssuePanel>, field: string, value: string): void {
  const input = host(fixture).querySelector(`[${field}] input, [${field}] textarea`);
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
    throw new Error(`Champ ${field} absent.`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function click(
  fixture: ComponentFixture<ExportKeyIssuePanel>,
  selector: string,
): Promise<void> {
  host(fixture).querySelector<HTMLButtonElement>(selector)?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ExportKeyIssuePanel', () => {
  it('propose une échéance à un an et refuse un libellé vide', async () => {
    const fixture = await boot();
    const date = host(fixture).querySelector<HTMLInputElement>('[data-expires] input');
    const nextYear = String(new Date().getFullYear() + 1);
    expect(date?.value.startsWith(nextYear)).toBe(true);
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-submit]')?.disabled).toBe(
      true,
    );
  });

  it('envoie le libellé, l’échéance et une adresse par ligne', async () => {
    const fixture = await boot();
    type(fixture, 'data-label', '  Direction ');
    type(fixture, 'data-ips', '203.0.113.7\n\n  198.51.100.2 \n');
    await click(fixture, 'button[data-submit]');
    expect(wire.issues).toHaveLength(1);
    expect(wire.issues[0]?.label).toBe('Direction');
    expect(wire.issues[0]?.allowedIps).toEqual(['203.0.113.7', '198.51.100.2']);
    expect(Number.isNaN(Date.parse(wire.issues[0]?.expiresAt ?? ''))).toBe(false);
  });

  it('montre le secret une fois, avec l’avertissement, puis l’efface à la fermeture', async () => {
    const fixture = await boot();
    type(fixture, 'data-label', 'Direction');
    await click(fixture, 'button[data-submit]');

    expect(host(fixture).querySelector<HTMLInputElement>('[data-secret] input')?.value).toBe(
      SECRET,
    );
    expect(host(fixture).querySelector('[data-warning]')?.textContent).toContain(
      'Cette clé ne sera plus jamais affichée',
    );
    expect(host(fixture).querySelector('[data-copy]')).not.toBeNull();

    await click(fixture, 'button[data-done]');
    expect(wire.closes).toEqual(['created']);
    expect(host(fixture).innerHTML).not.toContain(SECRET);
  });

  it('affiche le refus du serveur sur un rejeu (409), sans secret', async () => {
    const fixture = await boot();
    wire.refuse = {
      status: 409,
      message: 'Cette clé a déjà été créée : révoquez-la et créez-en une autre.',
    };
    type(fixture, 'data-label', 'Direction');
    await click(fixture, 'button[data-submit]');
    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'révoquez-la et créez-en une autre',
    );
    expect(host(fixture).querySelector('[data-secret]')).toBeNull();
  });
});
