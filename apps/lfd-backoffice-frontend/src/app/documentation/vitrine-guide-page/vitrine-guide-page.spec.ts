import { TestBed } from '@angular/core/testing';

import { buildVitrineGuideMarkdown } from '../vitrine-guide/vitrine-guide-markdown';
import { VITRINE_ENTITIES } from '../vitrine-guide/vitrine-guide-schema';
import { DocVitrineGuidePage } from './vitrine-guide-page';

async function render(): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [DocVitrineGuidePage] });
  const fixture = TestBed.createComponent(DocVitrineGuidePage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** jsdom n'a pas `Blob.text()` ; `FileReader`, si. */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('DocVitrineGuidePage', () => {
  it("marque l'hôte pour l'impression seule", async () => {
    const host = await render();
    expect(host.classList).toContain('print-standalone');
  });

  it('présente le XML comme servi : ni badge « prochainement », et le XSD nommé', async () => {
    const host = await render();
    expect(host.querySelector('[data-xml-soon]')).toBeNull();
    expect(host.querySelector('[data-xml]')?.textContent).toContain('/vitrine/schema.xsd');
  });

  it("dit qu'un contenu grossi arrive sous un Vitrine-Delivery neuf", async () => {
    const text = (await render()).textContent ?? '';
    expect(text).toContain('un contenu grossi arrive sous');
  });

  it('dit les unités exactes des prix', async () => {
    const text = (await render()).textContent ?? '';
    expect(text).toContain('millicentimes');
    expect(text).toMatch(/1\s€\s=\s100\s000/);
    expect(text).toContain('toutes taxes comprises');
  });

  it('imprime par le navigateur', async () => {
    const host = await render();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    host.querySelector<HTMLButtonElement>('[data-print]')?.click();
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('télécharge le guide en Markdown, fabriqué dans le navigateur', async () => {
    const host = await render();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:guide');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    host.querySelector<HTMLButtonElement>('[data-download-md]')?.click();

    expect(create).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('text/markdown;charset=utf-8');
    expect(await readText(blob as Blob)).toBe(buildVitrineGuideMarkdown(true));
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('guide-webhook-vitrine.md');
    expect(link.href).toBe('blob:guide');
    expect(revoke).toHaveBeenCalledWith('blob:guide');
    vi.restoreAllMocks();
  });

  it('a un tableau par entité du schéma', async () => {
    const host = await render();
    expect(host.querySelectorAll('.vg-entity')).toHaveLength(VITRINE_ENTITIES.length);
  });
});
