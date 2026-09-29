import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import { type GeoPoint, geoPoint } from "../domain/value-objects/geo-point.js";
import { geocodeFingerprint } from "./geocode-fingerprint.js";

/** Adaptateur Prisma de la lecture du cache du géocodage : par empreinte, les entrées fraîches. */
@Injectable()
export class PrismaGeocodeCacheReader extends GeocodeCacheReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(keys: readonly string[], freshSince: Date): Promise<ReadonlyMap<string, GeoPoint>> {
    if (keys.length === 0) {
      return new Map();
    }
    const byFingerprint = new Map(keys.map((key) => [geocodeFingerprint(key), key]));
    const rows = await this.prisma.deliveryGeocode.findMany({
      where: { fingerprint: { in: [...byFingerprint.keys()] }, geocodedAt: { gte: freshSince } },
      select: { fingerprint: true, lat: true, lng: true },
    });
    return new Map(
      rows.flatMap((row) => {
        const key = byFingerprint.get(row.fingerprint);
        return key === undefined ? [] : [[key, geoPoint(row.lat, row.lng)] as const];
      }),
    );
  }
}
