import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';

import { AgentToolsPage } from './agent-tools-page';

/**
 * L'écran des outils agent. Aucune requête n'est vidée : la page se peint sans
 * réseau, et c'est ce qu'on vérifie en même temps que le reste.
 */
function render(granted: readonly string[] = ['pim_catalog:write']) {
  const permissions: Pick<PermissionsStore, 'can'> = {
    can: (permission) => granted.includes(permission),
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PermissionsStore, useValue: permissions },
    ],
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

  it("n'annonce ni signature « publiable » ni archivage", () => {
    const { root } = render();
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    // Le tarif, la TVA et la publication ont été ouverts par Hugo le
    // 2026-10-17 ; la signature et l'archivage restent au clic.
    for (const forbidden of ['archive', 'ready']) {
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

  it('ne déclare la trousse de la médiathèque qu’avec `media_library:write`', () => {
    const without = render(['pim_catalog:write']);
    const listed = [...without.root.querySelectorAll('code')].map((el) => el.textContent?.trim());
    expect(listed.some((name) => name?.startsWith('media_'))).toBe(false);
    expect(without.root.textContent).toContain("pas le droit d'écrire dans la médiathèque");
    TestBed.resetTestingModule();

    const granted = render(['pim_catalog:write', 'media_library:write']);
    const both = [...granted.root.querySelectorAll('code')].map((el) => el.textContent?.trim());
    expect(both).toContain('media_search');
    expect(both).toContain('pim_product_create');
  });

  it('ne déclare QUE la médiathèque pour un compte qui n’a qu’elle, et dit ce qui manque', () => {
    const { root } = render(['media_library:write']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed).toContain('media_search');
    expect(listed.some((name) => name.startsWith('pim_'))).toBe(false);
    expect(root.textContent).toContain("pas le droit d'écrire dans le référentiel");
  });

  it('ne déclare QUE l’exploitation pour un compte qui n’a que la carte de santé', () => {
    const { root } = render(['ops_health:read']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed).toContain('ops_health');
    expect(listed).toContain('ops_dead_letters');
    expect(listed.some((name) => name.startsWith('pim_') || name.startsWith('media_'))).toBe(false);
    expect(root.textContent).toContain("pas le droit d'écrire dans le référentiel");
    expect(root.textContent).toContain("pas le droit d'écrire dans la médiathèque");
  });

  it('dit quel droit manque à qui n’a pas la carte de santé', () => {
    const { root } = render(['pim_catalog:write']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed.some((name) => name.startsWith('ops_'))).toBe(false);
    expect(root.textContent).toContain('pas le droit de lire la carte de santé');
  });

  it('ne déclare QUE les comptes clients, en lecture, pour un compte qui n’a que `b2b_companies:read`', () => {
    const { root } = render(['b2b_companies:read']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed).toContain('accounts_search');
    expect(listed).toContain('signups_pending');
    expect(
      listed.some(
        (name) => name.startsWith('pim_') || name.startsWith('media_') || name.startsWith('ops_'),
      ),
    ).toBe(false);
  });

  it('dit quel droit manque à qui ne lit pas les comptes clients', () => {
    const { root } = render(['pim_catalog:write']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed.some((name) => name.startsWith('account'))).toBe(false);
    expect(root.textContent).toContain('pas le droit de lire les comptes clients');
  });
  it('ne déclare QUE la lecture de la flotte sans `delivery_settings:write`', () => {
    const { root } = render(['delivery_settings:read']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed).toEqual(['vehicle_list']);
    expect(root.textContent).toContain('pas le droit de modifier la flotte');
  });

  it('déclare l’écriture de la flotte avec `delivery_settings:write`, et dit ce qui manque sans lecture', () => {
    const granted = render(['delivery_settings:read', 'delivery_settings:write']);
    const listed = [...granted.root.querySelectorAll('code')].map((el) => el.textContent?.trim());
    expect(listed).toContain('vehicle_create');
    expect(listed).toContain('vehicle_update');
    TestBed.resetTestingModule();

    const without = render(['pim_catalog:write']);
    expect(without.root.textContent).toContain('pas le droit de lire les réglages de livraison');
  });

  it('ne déclare QUE la lecture des droits sans `staff_access:write`', () => {
    const { root } = render(['staff_access:read']);
    const listed = [...root.querySelectorAll('code')].map((el) => el.textContent?.trim() ?? '');

    expect(listed).toEqual(['roles_list', 'role_get', 'staff_list', 'staff_access_of', 'who_can']);
    expect(root.textContent).toContain('pas le droit de modifier les rôles ni l');
  });

  it('déclare l’écriture des droits avec `staff_access:write`, et dit ce qui manque sans lecture', () => {
    const granted = render(['staff_access:read', 'staff_access:write']);
    const listed = [...granted.root.querySelectorAll('code')].map((el) => el.textContent?.trim());
    expect(listed).toContain('role_grant');
    expect(listed).toContain('role_revoke');
    expect(listed).toContain('staff_assign_role');
    TestBed.resetTestingModule();

    const without = render(['pim_catalog:write']);
    expect(without.root.textContent).toContain('pas le droit de lire les rôles et l');
  });
});
