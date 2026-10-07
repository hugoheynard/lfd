import type { HttpClient } from '@angular/common/http';
import type * as PmTilesModule from 'pmtiles';
import { firstValueFrom } from 'rxjs';

/**
 * **Ce que la carte charge avant de dessiner** — la feuille de style de
 * MapLibre et les archives pmtiles des rues et du relief. Sorti du composant
 * `DeliveryMap`, qui ne garde que le cycle de vie de la carte.
 *
 * Type-only sur `pmtiles` : la bibliothèque, chargée à la demande (L10b-C6),
 * est passée en argument.
 */

export const STREETS_FILE = 'rues.pmtiles';
export const RELIEF_FILE = 'relief.pmtiles';
/** Le CSS de MapLibre : un paquet de styles non injecté (`angular.json`), posé à la première carte. */
const MAPLIBRE_CSS = 'maplibre-gl.css';

/** Pose la feuille de style de MapLibre dans le document, une seule fois. */
export function ensureMaplibreStylesheet(document: Document): void {
  if (document.head.querySelector('link[data-maplibre-css]') !== null) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = MAPLIBRE_CSS;
  link.dataset['maplibreCss'] = '';
  document.head.append(link);
}

/** En développement, le fichier entier en mémoire ; en production, des plages. */
export async function registerPmTiles(
  http: HttpClient,
  pmtiles: typeof PmTilesModule,
  protocol: PmTilesModule.Protocol,
  url: string,
  wholeFile: boolean,
): Promise<void> {
  if (!wholeFile) {
    protocol.add(new pmtiles.PMTiles(url));
    return;
  }
  // Un fichier binaire, pas une réponse d'API : aucun contrat à typer.
  const buffer = await firstValueFrom(http.get(url, { responseType: 'arraybuffer' }));
  protocol.add(
    new pmtiles.PMTiles({
      getKey: () => url,
      getBytes: (offset: number, length: number) =>
        Promise.resolve({ data: buffer.slice(offset, offset + length) }),
    }),
  );
}
