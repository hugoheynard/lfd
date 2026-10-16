import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { OperationImagePicker } from './operation-image-picker';

describe('OperationImagePicker', () => {
  it("ferme sur l'adresse de l'image désignée", () => {
    const closed: (string | undefined)[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FoldPanelRef, useValue: { close: (value?: string) => closed.push(value) } },
      ],
    });
    const fixture = TestBed.createComponent(OperationImagePicker);
    fixture.componentRef.setInput('data', { currentUrl: '' });
    fixture.detectChanges();
    fixture.componentInstance['pick']({ url: 'https://cdn.test/buche.jpg' });
    expect(closed).toEqual(['https://cdn.test/buche.jpg']);
  });
});
