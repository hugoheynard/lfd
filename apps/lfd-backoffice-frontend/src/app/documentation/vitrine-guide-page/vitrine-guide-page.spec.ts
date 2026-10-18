import { TestBed } from '@angular/core/testing';

import { VITRINE_ENTITIES } from '../vitrine-guide/vitrine-guide-schema';
import { DocVitrineGuidePage } from './vitrine-guide-page';

async function render(): Promise<HTMLElement> {
  TestBed.configureTestingModule({ imports: [DocVitrineGuidePage] });
  const fixture = TestBed.createComponent(DocVitrineGuidePage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DocVitrineGuidePage', () => {
  it("marque l'hôte pour l'impression seule", async () => {
    const host = await render();
    expect(host.classList).toContain('print-standalone');
  });

  it('annonce le XML comme disponible prochainement tant que le drapeau est baissé', async () => {
    const host = await render();
    expect(host.querySelector('[data-xml-soon]')).not.toBeNull();
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

  it('a un tableau par entité du schéma', async () => {
    const host = await render();
    expect(host.querySelectorAll('.vg-entity')).toHaveLength(VITRINE_ENTITIES.length);
  });
});
