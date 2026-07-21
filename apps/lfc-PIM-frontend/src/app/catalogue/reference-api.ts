import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type AllergenScope = 'eu' | 'world';

export interface AllergenEntry {
  code: string;
  /** Libellé granulaire — « Noisette ». */
  label: string;
  incoCategory: string | null;
  /** Libellé d'étiquette — « Fruits à coque ». C'est lui qui fait foi. */
  incoLabel: string | null;
  provisional: boolean;
}

export interface AllergenReference {
  scope: AllergenScope;
  entries: AllergenEntry[];
  hasProvisionalCodes: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReferenceApi {
  private readonly http = inject(HttpClient);

  allergens(scope: AllergenScope): Promise<AllergenReference> {
    return firstValueFrom(
      this.http.get<AllergenReference>(
        `http://localhost:3100/reference/allergens?scope=${scope}`,
      ),
    );
  }
}
