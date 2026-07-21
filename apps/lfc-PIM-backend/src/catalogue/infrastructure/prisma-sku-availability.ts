import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/database/prisma.service.js';
import type { SkuAvailability } from '../domain/services/sku-generator.js';
import type { Sku } from '../domain/value-objects/sku.value-object.js';

/**
 * Consultation du registre des références.
 *
 * ⚠️ Ne **garantit rien** : entre cette lecture et l'écriture, une autre requête peut
 * prendre la même référence (TOCTOU). C'est assumé — cette couche existe pour proposer
 * un défaut plausible et produire un message clair ; la garantie est la clé primaire de
 * `sku_registry` (doc 06 §5, les trois couches).
 */
@Injectable()
export class PrismaSkuAvailability implements SkuAvailability {
  constructor(private readonly prisma: PrismaService) {}

  async isTaken(candidate: Sku): Promise<boolean> {
    const found = await this.prisma.skuRegistry.findUnique({
      where: { value: candidate.value },
      select: { value: true },
    });
    return found !== null;
  }
}

export const SKU_AVAILABILITY = Symbol('SkuAvailability');
