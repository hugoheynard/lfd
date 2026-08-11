import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ActivationAside } from '../activation-aside/activation-aside';

interface Rendered {
  readonly host: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly activations: number[];
}

function render(options: {
  readonly pending: boolean;
  readonly canActivate?: boolean;
  readonly blockedReason?: string;
  readonly remaining?: number;
}): Rendered {
  const fixture = TestBed.createComponent(ActivationAside);
  fixture.componentRef.setInput('pending', options.pending);
  fixture.componentRef.setInput('canActivate', options.canActivate ?? false);
  fixture.componentRef.setInput('blockedReason', options.blockedReason ?? '');
  fixture.componentRef.setInput('remaining', options.remaining ?? 0);
  const activations: number[] = [];
  fixture.componentInstance.activate.subscribe(() => activations.push(1));
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { host, button: host.querySelector('button') as HTMLButtonElement, activations };
}

describe('rail Activation du compte', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('DIT pourquoi il refuse, au lieu de griser en silence', () => {
    // Un bouton grisé muet est une impasse : on ne sait pas quoi corriger.
    const { host, button } = render({
      pending: true,
      blockedReason: 'Aucun interlocuteur joignable : renseignez au moins un numéro de téléphone.',
      remaining: 2,
    });

    expect(button.disabled).toBe(true);
    expect(host.textContent).toContain('Aucun interlocuteur joignable');
    expect(host.textContent).toContain('2 pièces manquantes');
  });

  it('accorde le singulier quand il ne reste qu’une pièce', () => {
    const { host } = render({ pending: true, remaining: 1 });

    expect(host.textContent).toContain('1 pièce manquante');
    expect(host.textContent).not.toContain('1 pièces');
  });

  it('active en un clic quand le dossier est complet', () => {
    const { button, activations } = render({ pending: true, canActivate: true });

    expect(button.disabled).toBe(false);
    button.click();

    expect(activations).toHaveLength(1);
  });

  it("n'offre AUCUNE activation sur un compte déjà actif", () => {
    // Le geste n'a plus de sens : le montrer grisé ferait douter du statut.
    const { host } = render({ pending: false });

    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('Compte actif');
  });
});
