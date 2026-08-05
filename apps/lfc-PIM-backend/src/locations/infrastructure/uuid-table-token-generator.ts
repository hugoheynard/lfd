import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { TableTokenGenerator } from '../domain/ports/table-token-generator.js';

/**
 * Token QR = UUID v4 aléatoire (non ordonné, non devinable) — un secret
 * d'accès, pas un identifiant de ligne : il ne sert jamais de clé étrangère.
 */
@Injectable()
export class UuidTableTokenGenerator extends TableTokenGenerator {
  next(): string {
    return randomUUID();
  }
}
