/**
 * **Une photo de contrôle**, ses octets. Servie en `b2b_supervision:write`
 * seulement (D3) : une photo peut montrer une étiquette, un nom, une adresse.
 */
export class GetQualityPhotoQuery {
  constructor(
    readonly checkId: string,
    readonly position: number,
  ) {}
}
