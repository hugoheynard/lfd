import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { GpsPoint } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type * as MapLibreModule from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type * as PmTilesModule from 'pmtiles';

import {
  MAP_PALETTE_TOKENS,
  type MapPalette,
  type MapRoute,
  mapStyleOf,
  ROUTES_SOURCE,
  routesGeoJson,
} from '../delivery-map-style';
import { colorOf, type PlannedRound, stopNameOf, stopPointOf } from '../delivery-planning';
import { MAP_TILES } from '../map-tiles.config';

type MapState = 'absent' | 'loading' | 'ready' | 'error';

type MapLibre = typeof MapLibreModule;
type PmTiles = typeof PmTilesModule;

/** Le départ de toutes les tournées : le point de retrait configuré. */
export interface MapDeparture {
  readonly label: string;
  readonly gps: GpsPoint;
}

const STREETS_FILE = 'rues.pmtiles';
const RELIEF_FILE = 'relief.pmtiles';
/** Le CSS de MapLibre : un paquet de styles non injecté (`angular.json`), posé à la première carte. */
const MAPLIBRE_CSS = 'maplibre-gl.css';
const INITIAL_ZOOM = 10;
const FIT_PADDING = 40;

/**
 * **La carte de l'écran « Planifier »** (lot 10 bis, L10b-C1, C4, C6) :
 * les tracés par la route, un repère numéroté par arrêt à la couleur de sa
 * camionnette, le labo, et les villes traversées.
 *
 * MapLibre et pmtiles sont chargés à la demande, jamais au démarrage (L10b-C6).
 * Sans URL de tuiles (production, tant que le bucket n'existe pas), la carte
 * est absente et le dit ; les feuilles de route n'en dépendent pas.
 *
 * `ViewEncapsulation.None` : les repères sont des éléments que MapLibre place
 * lui-même, hors de la portée des styles émulés. Toutes les classes sont
 * préfixées `delivery-map`, donc rien ne fuit.
 */
@Component({
  selector: 'app-delivery-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './delivery-map.html',
  styleUrl: './delivery-map.scss',
})
export class DeliveryMap {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tiles = inject(MAP_TILES);

  readonly rounds = input.required<readonly PlannedRound[]>();
  readonly departure = input.required<MapDeparture>();
  /** L'arrêt survolé dans une feuille de route. */
  readonly highlighted = input<string | null>(null);

  /** L'arrêt survolé sur la carte, `null` en sortant. */
  readonly hovered = output<string | null>();

  protected readonly state = signal<MapState>('loading');
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  /** Les tournées qui ont des arrêts mais pas de tracé : la carte le dit (L10b-C4). */
  protected readonly untraced = computed(() =>
    this.rounds()
      .filter((round) => round.stops.length > 0 && round.timing !== null && round.geometry === null)
      .map((round) => round.vehicleName),
  );
  /** Les arrêts sans point dans le carnet : pas de repère. */
  protected readonly unplaced = computed(
    () =>
      this.rounds()
        .flatMap((round) => round.stops)
        .filter((stop) => stopPointOf(stop) === null).length,
  );
  protected readonly legend = computed(() => {
    const rounds = this.rounds();
    const seen = new Set<string>();
    return rounds.flatMap((round) => {
      if (seen.has(round.vehicleName) || round.stops.length === 0) {
        return [];
      }
      seen.add(round.vehicleName);
      return [{ name: round.vehicleName, color: `var(${colorOf(rounds, round.key)})` }];
    });
  });

  private map: MapLibreMap | null = null;
  private library: MapLibre | null = null;
  private markers: { readonly orderId: string | null; readonly marker: Marker }[] = [];
  private fitted = false;

  constructor() {
    afterNextRender(() => void this.start());
    effect(() => {
      const rounds = this.rounds();
      if (this.state() === 'ready') {
        untracked(() => this.draw(rounds));
      }
    });
    effect(() => {
      const highlighted = this.highlighted();
      if (this.state() === 'ready') {
        untracked(() => this.highlight(highlighted));
      }
    });
    inject(DestroyRef).onDestroy(() => this.map?.remove());
  }

  protected retry(): void {
    void this.start();
  }

  private async start(): Promise<void> {
    const tiles = this.tiles;
    if (tiles.baseUrl === '') {
      this.state.set('absent');
      return;
    }
    this.state.set('loading');
    this.map?.remove();
    this.map = null;
    try {
      this.ensureStylesheet();
      const [library, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
      const protocol = new pmtiles.Protocol();
      library.addProtocol('pmtiles', protocol.tile);
      const streets = new URL(`${tiles.baseUrl}${STREETS_FILE}`, this.document.baseURI).href;
      const relief = new URL(`${tiles.baseUrl}${RELIEF_FILE}`, this.document.baseURI).href;
      await Promise.all(
        [streets, relief].map((url) => this.register(pmtiles, protocol, url, tiles.wholeFile)),
      );
      const { gps } = this.departure();
      const map = new library.Map({
        container: this.canvas().nativeElement,
        style: mapStyleOf(this.palette(), `pmtiles://${streets}`, `pmtiles://${relief}`, []),
        center: [gps.lng, gps.lat],
        zoom: INITIAL_ZOOM,
        attributionControl: { compact: true },
      });
      map.addControl(new library.NavigationControl({ showCompass: false }), 'top-right');
      this.library = library;
      this.map = map;
      this.fitted = false;
      map.once('load', () => this.state.set('ready'));
    } catch {
      this.state.set('error');
    }
  }

  /** En développement, le fichier entier en mémoire ; en production, des plages. */
  private async register(
    pmtiles: PmTiles,
    protocol: PmTilesModule.Protocol,
    url: string,
    wholeFile: boolean,
  ): Promise<void> {
    if (!wholeFile) {
      protocol.add(new pmtiles.PMTiles(url));
      return;
    }
    // Un fichier binaire, pas une réponse d'API : aucun contrat à typer.
    const buffer = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
    protocol.add(
      new pmtiles.PMTiles({
        getKey: () => url,
        getBytes: (offset: number, length: number) =>
          Promise.resolve({ data: buffer.slice(offset, offset + length) }),
      }),
    );
  }

  private ensureStylesheet(): void {
    if (this.document.head.querySelector('link[data-maplibre-css]') !== null) {
      return;
    }
    const link = this.document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MAPLIBRE_CSS;
    link.dataset['maplibreCss'] = '';
    this.document.head.append(link);
  }

  /** MapLibre ne lit pas `var()` : chaque token est résolu en couleur calculée. */
  private resolve(token: string): string {
    const probe = this.document.createElement('span');
    probe.style.color = `var(${token})`;
    this.host.nativeElement.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }

  private palette(): MapPalette {
    const color = (key: keyof MapPalette): string => this.resolve(MAP_PALETTE_TOKENS[key]);
    return {
      land: color('land'),
      wood: color('wood'),
      grass: color('grass'),
      ice: color('ice'),
      built: color('built'),
      water: color('water'),
      road: color('road'),
      roadMajor: color('roadMajor'),
      shade: color('shade'),
      light: color('light'),
      halo: color('halo'),
    };
  }

  private draw(rounds: readonly PlannedRound[]): void {
    const map = this.map;
    const library = this.library;
    if (map === null || library === null) {
      return;
    }
    const routes: MapRoute[] = rounds.flatMap((round) =>
      round.geometry === null
        ? []
        : [{ color: this.resolve(colorOf(rounds, round.key)), coordinates: round.geometry }],
    );
    map.getSource<GeoJSONSource>(ROUTES_SOURCE)?.setData(routesGeoJson(routes));

    for (const { marker } of this.markers) {
      marker.remove();
    }
    const add = (element: HTMLElement, at: GpsPoint, orderId: string | null): void => {
      const marker = new library.Marker({ element }).setLngLat([at.lng, at.lat]).addTo(map);
      this.markers.push({ orderId, marker });
    };
    this.markers = [];

    const departure = this.departure();
    add(this.element('delivery-map__lab', 'L', `${departure.label} — départ`), departure.gps, null);
    for (const town of townsOf(rounds)) {
      add(this.element('delivery-map__town', town.name, ''), town.at, null);
    }
    for (const round of rounds) {
      const color = `var(${colorOf(rounds, round.key)})`;
      round.stops.forEach((stop, index) => {
        const point = stopPointOf(stop);
        if (point === null) {
          return;
        }
        const pin = this.element(
          stop.windowMissed ? 'delivery-map__pin delivery-map__pin--late' : 'delivery-map__pin',
          String(index + 1),
          stop.arrival === null ? stopNameOf(stop) : `${stopNameOf(stop)} — ${stop.arrival}`,
        );
        pin.style.setProperty('--delivery-map-pin', color);
        pin.addEventListener('mouseenter', () => this.hovered.emit(stop.orderId));
        pin.addEventListener('mouseleave', () => this.hovered.emit(null));
        add(pin, point, stop.orderId);
      });
    }
    this.highlight(this.highlighted());
    if (!this.fitted) {
      this.fit(rounds);
    }
  }

  private element(className: string, text: string, title: string): HTMLElement {
    const element = this.document.createElement('div');
    element.className = className;
    element.textContent = text;
    if (title !== '') {
      element.title = title;
    }
    return element;
  }

  private highlight(orderId: string | null): void {
    for (const { orderId: id, marker } of this.markers) {
      if (id !== null) {
        marker.getElement().classList.toggle('delivery-map__pin--highlighted', id === orderId);
      }
    }
  }

  private fit(rounds: readonly PlannedRound[]): void {
    const map = this.map;
    const library = this.library;
    if (map === null || library === null) {
      return;
    }
    const { gps } = this.departure();
    const bounds = new library.LngLatBounds([gps.lng, gps.lat], [gps.lng, gps.lat]);
    for (const round of rounds) {
      for (const [lng, lat] of round.geometry ?? []) {
        bounds.extend([lng, lat]);
      }
      for (const stop of round.stops) {
        const point = stopPointOf(stop);
        if (point !== null) {
          bounds.extend([point.lng, point.lat]);
        }
      }
    }
    map.fitBounds(bounds, { padding: FIT_PADDING, duration: 0 });
    this.fitted = true;
  }
}

/**
 * Les villes traversées, placées au centre de leurs arrêts : pas de glyphes
 * dans les tuiles, donc un marqueur HTML par ville (comme la maquette), et
 * seulement celles qu'on dessert — jamais une liste de villes écrite en dur.
 */
export function townsOf(
  rounds: readonly PlannedRound[],
): readonly { readonly name: string; readonly at: GpsPoint }[] {
  const byTown = new Map<string, GpsPoint[]>();
  for (const stop of rounds.flatMap((round) => round.stops)) {
    const town = stop.sheet?.address?.ville.trim() ?? '';
    const point = stopPointOf(stop);
    if (town !== '' && point !== null) {
      byTown.set(town, [...(byTown.get(town) ?? []), point]);
    }
  }
  return [...byTown].map(([name, points]) => ({
    name,
    at: {
      lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
      lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    },
  }));
}
