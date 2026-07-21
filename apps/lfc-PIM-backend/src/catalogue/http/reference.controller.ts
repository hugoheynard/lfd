import { Controller, Get, Query } from '@nestjs/common';

import {
  allergenReference,
  type AllergenReference,
} from '../../allergens/allergen-reference.js';
import { Public } from '../../infra/auth/public.decorator.js';

/** ⚠️ `@Public()` temporaire — même dérogation que le reste (Auth0 non configuré). */
@Public()
@Controller('reference')
export class ReferenceController {
  /**
   * Référentiel des allergènes. `scope=eu` (défaut) = la liste **légale** ;
   * `scope=world` = la liste **interopérable**, codes hors UE compris.
   */
  @Get('allergens')
  allergens(@Query('scope') scope?: string): AllergenReference {
    return allergenReference(scope === 'world' ? 'world' : 'eu', 'fr');
  }
}
