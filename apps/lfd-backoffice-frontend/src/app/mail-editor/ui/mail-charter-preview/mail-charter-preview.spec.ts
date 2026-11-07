import { TestBed } from '@angular/core/testing';
import type { MailCharterPreviewPayload, MailCharterSettings } from '@lfd/mail-blocks';
import { describe, expect, it, vi } from 'vitest';

import { MailChartersService } from '../../data/mail-charters.service';
import { MailCharterPreview } from './mail-charter-preview';

const SETTINGS: MailCharterSettings = {
  logo: null,
  colors: {
    page: '#f4f1ea',
    card: '#ffffff',
    text: '#1a1a1a',
    mutedText: '#555555',
    primary: '#24448f',
    band: '#1a3157',
    border: '#dddddd',
  },
  darkColors: { page: '#111111', card: '#1c1c1c', text: '#f0f0f0', border: '#333333' },
  headingFont: null,
  footer: {},
};

async function render(preview: () => Promise<unknown>) {
  const spy = vi.fn((_space: string, _payload: MailCharterPreviewPayload) => preview());
  TestBed.configureTestingModule({
    imports: [MailCharterPreview],
    providers: [{ provide: MailChartersService, useValue: { preview: spy } }],
  });
  const fixture = TestBed.createComponent(MailCharterPreview);
  fixture.componentRef.setInput('space', 'lfd');
  fixture.componentRef.setInput('locale', 'fr');
  fixture.componentRef.setInput('settings', SETTINGS);
  fixture.componentRef.setInput('templates', ['staff.invited', 'staff.account-alert']);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const click = async () => {
    element.querySelector<HTMLButtonElement>('[data-render]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, element, spy, click };
}

describe('MailCharterPreview', () => {
  it('ne demande rien avant le clic, puis rend la charte à l’écran dans un cadre inerte', async () => {
    const { element, spy, click } = await render(() =>
      Promise.resolve({
        space: 'lfd',
        template: 'staff.invited',
        locale: 'fr',
        subject: 'Bienvenue',
        html: '<p>Bonjour</p>',
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    await click();
    expect(spy).toHaveBeenCalledWith('lfd', { locale: 'fr', settings: SETTINGS });
    const frame = element.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('');
    expect(element.textContent).toContain('Bienvenue');
  });

  it('dit que l’aperçu est périmé quand la charte change, et pose le thème sombre sans redemander', async () => {
    const { fixture, element, spy, click } = await render(() =>
      Promise.resolve({ space: 'lfd', template: 't', locale: 'fr', subject: 's', html: '' }),
    );
    await click();
    fixture.componentRef.setInput('settings', { ...SETTINGS, footer: { fr: 'x' } });
    fixture.componentInstance.scheme.set('dark');
    fixture.detectChanges();
    expect(element.querySelector('[data-stale]')).not.toBeNull();
    expect(element.querySelector<HTMLIFrameElement>('iframe')?.style.colorScheme).toBe('dark');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('dit l’échec du rendu', async () => {
    const { element, click } = await render(() => Promise.reject(new Error('boom')));
    await click();
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
  });
});
