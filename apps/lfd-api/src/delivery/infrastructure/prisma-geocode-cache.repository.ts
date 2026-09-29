import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { GeocodeCacheRepository } from "../domain/ports/geocode-cache.repository.js";
import type { GeocodeAnswer } from "../domain/ports/geocoder.js";
import { geocodeFingerprint } from "./geocode-fingerprint.js";

/**
 * Adaptateur Prisma de l'écriture du cache du géocodage. 🔴 La clé
 * normalisée n'est JAMAIS écrite : seule son empreinte l'est.
 */
@Injectable()
export class PrismaGeocodeCacheRepository extends GeocodeCacheRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(answers: readonly GeocodeAnswer[], at: Date): Promise<void> {
    for (const answer of answers) {
      if (answer.point === null) {
        continue;
      }
      const row = {
        lat: answer.point.lat,
        lng: answer.point.lng,
        score: answer.score,
        geocodedAt: at,
      };
      const fingerprint = geocodeFingerprint(answer.key);
      await this.prisma.deliveryGeocode.upsert({
        where: { fingerprint },
        create: { fingerprint, ...row },
        update: row,
      });
    }
  }
}
