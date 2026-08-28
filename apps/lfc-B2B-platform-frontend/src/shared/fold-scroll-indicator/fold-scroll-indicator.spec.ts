import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FoldScrollIndicatorComponent } from './fold-scroll-indicator';

describe('FoldScrollIndicatorComponent', () => {
  let fixture: ComponentFixture<FoldScrollIndicatorComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const slots = (): HTMLElement[] => Array.from(el().querySelectorAll('.slot'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FoldScrollIndicatorComponent] });
    fixture = TestBed.createComponent(FoldScrollIndicatorComponent);
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
  });

  it('draws nothing for a single item — one item is not a set', () => {
    fixture.componentRef.setInput('count', 1);
    fixture.detectChanges();
    expect(slots().length).toBe(0);
  });

  it('marks the active item, and only it', () => {
    fixture.componentRef.setInput('active', 2);
    fixture.detectChanges();
    expect(slots().map((s) => s.classList.contains('on'))).toEqual([false, false, true]);
    expect(slots()[2]?.getAttribute('aria-current')).toBe('true');
  });

  it('reports the picked index rather than moving anything itself', () => {
    // Le puits sait où sont ses cartes ; l'indicateur ne sait que son rang.
    const picked: number[] = [];
    fixture.componentInstance.picked.subscribe((index) => picked.push(index));
    (slots()[1] as HTMLButtonElement).click();
    expect(picked).toEqual([1]);
  });

  it('renders plain elements when it is not interactive', () => {
    // Un bouton qu'on ne peut pas presser est quand même annoncé comme bouton :
    // un lecteur d'écran offrirait alors une commande qui ne fait rien.
    fixture.componentRef.setInput('interactive', false);
    fixture.detectChanges();
    expect(el().querySelectorAll('button').length).toBe(0);
    expect(slots().length).toBe(3);
  });

  it('numbers its labels from one, not from zero', () => {
    fixture.componentRef.setInput('markerLabel', 'Aller au suivi {n}');
    fixture.detectChanges();
    expect(slots()[0]?.getAttribute('aria-label')).toBe('Aller au suivi 1');
  });
});
