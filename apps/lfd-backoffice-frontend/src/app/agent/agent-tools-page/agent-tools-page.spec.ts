import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AgentToolsPage } from './agent-tools-page';

/**
 * L'écran des outils agent. Aucune requête n'est vidée : la page se peint sans
 * réseau, et c'est ce qu'on vérifie en même temps que le reste.
 */
function render() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(AgentToolsPage);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('AgentToolsPage', () => {
  it('affiche les outils que la DÉCLARATION rend, pas une liste recopiée', () => {
    const { root } = render();
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim());

    // Le point du test n'est pas le compte : c'est que l'écran tire ses noms de
    // `declarePimAgentTools()`. Une liste écrite dans le gabarit survivrait à un
    // outil supprimé, et la page annoncerait une capacité absente.
    expect(listed).toContain('pim_product_create');
    expect(listed).toContain('pim_product_set_identity');
    expect(listed.length).toBeGreaterThan(1);
  });

  it("n'annonce AUCUN outil d'argent ni de publication", () => {
    const { root } = render();
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    // Exclusions décidées au plan (§6), et vérifiées ici plutôt que promises :
    // l'argent ne s'écrit pas par un outil, publier reste une décision humaine.
    for (const forbidden of ['pricing', 'vat', 'publish', 'archive', 'ready']) {
      expect(listed.some((name) => name.includes(forbidden))).toBe(false);
    }
  });

  it('dit que les outils sont INERTES quand aucun agent ne fournit WebMCP', () => {
    // Ni `document.modelContext` ni `navigator.modelContext` dans le harnais :
    // c'est l'état de tout navigateur aujourd'hui, et l'écran doit le dire au
    // lieu de laisser croire qu'il pilote quelque chose.
    expect('modelContext' in document).toBe(false);

    const { root } = render();
    expect(root.textContent).toContain('Aucun agent branché');
    expect(root.textContent).not.toContain('Outils armés');
  });
});
