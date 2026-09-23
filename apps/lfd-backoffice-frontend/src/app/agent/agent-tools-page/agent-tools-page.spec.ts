import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * Pose une passerelle WebMCP minimale sur `document`, et rend la liste des noms
 * réellement enregistrés.
 *
 * `Object.defineProperty` plutôt qu'une affectation : `modelContext` n'existe
 * pas dans la bibliothèque DOM de TypeScript, et le dépôt refuse les casts.
 * `registerTool` est une VRAIE fonction parce que c'est ce qu'Angular vérifie
 * avant d'enregistrer quoi que ce soit.
 */
function installAgent(): readonly string[] {
  const registered: string[] = [];
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: { readonly name: string }): Promise<void> => {
        registered.push(tool.name);
        return Promise.resolve();
      },
    },
  });
  return registered;
}

/** Une seconde : la cadence du sondage, exactement. */
const PROBE_MS = 1_000;

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  vi.useRealTimers();
});

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

  it("arme les outils quand l'agent apparaît APRÈS l'ouverture de la page", () => {
    // Régression : `bridged` était un `computed` sans dépendance de signal, donc
    // évalué une seule fois à la construction. Un agent qui injectait
    // `modelContext` ensuite ne voyait RIEN s'enregistrer, et la bannière
    // annonçait « Aucun agent branché » pour toujours (2026-09-23).
    vi.useFakeTimers();
    const { fixture, root } = render();
    expect(root.textContent).toContain('Aucun agent branché');

    const registered = installAgent();
    vi.advanceTimersByTime(PROBE_MS);
    fixture.detectChanges();

    expect(root.textContent).toContain('Outils armés');
    expect(registered).toContain('pim_product_create');
    expect(registered.length).toBeGreaterThan(1);
  });

  it("n'enregistre PAS deux fois, et arrête le sondage dès qu'il a trouvé", () => {
    vi.useFakeTimers();
    const stopped = vi.spyOn(globalThis, 'clearInterval');
    const { fixture } = render();

    const registered = installAgent();
    vi.advanceTimersByTime(PROBE_MS);
    fixture.detectChanges();
    const armedCount = registered.length;

    // Le timer est annulé à la première détection : un sondage qui continue est
    // un timer qui tourne pour rien, et une seconde déclaration enregistrerait
    // chaque outil en double.
    expect(stopped).toHaveBeenCalled();
    vi.advanceTimersByTime(PROBE_MS * 10);
    expect(registered.length).toBe(armedCount);
  });

  it('arrête le sondage en quittant la page, même sans agent', () => {
    // L'invariant de l'écran-interrupteur vaut aussi pour le sondage : page
    // quittée, plus rien ne tourne — et un agent qui arrive après ne peut plus
    // armer une page détruite.
    vi.useFakeTimers();
    const { fixture } = render();
    fixture.destroy();

    const registered = installAgent();
    vi.advanceTimersByTime(PROBE_MS * 10);

    expect(registered).toEqual([]);
  });
});
