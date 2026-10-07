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
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type * as MapLibreModule from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';

import { mapLegend, untracedVehicles } from '../delivery-map-legend';
import { markerElement, roundsBounds, stopPinClass } from '../delivery-map-markers';
import {
  type MapRoute,
  type MapRouteStyle,
  glyphsUrlOf,
  mapStyleOf,
  ROUTES_SOURCE,
  routesGeoJson,
} from '../delivery-map-style';
import { type PlannedRound, roundColor, stopNameOf, stopPointOf } from '../delivery-planning';
import { MapPaletteResolver } from '../map-palette-resolver';
import {
  ensureMaplibreStylesheet,
  RELIEF_FILE,
  registerPmTiles,
  STREETS_FILE,
} from '../map-tile-sources';
import { MAP_TILES } from '../map-tiles.config';

type MapState = 'absent' | 'loading' | 'ready' | 'error';

type MapLibre = typeof MapLibreModule;

/** Le départ de toutes les tournées : le point de retrait configuré. */
export interface MapDeparture {
  readonly label: string;
  readonly gps: GpsPoint;
}

const INITIAL_ZOOM = 10;
const FIT_PADDING = 40;

/**
 * **La carte de l'organisateur de tournées** (lot 10 bis, L10b-C1, C4, C6 ;
 * `handoff-tournees/SPEC.md`, § 5) : les tracés par la route, un repère
 * numéroté par arrêt à la couleur de son véhicule, le labo ; les noms de
 * lieux sont dessinés par la carte. Les tournées `muted` se tracent en
 * pointillé estompé, les `dashed` en tirets (un second passage).
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
  private readonly tiles = inject(MAP_TILES);
  /** Les tokens fold résolus en couleurs que MapLibre sait lire. */
  private readonly paletteResolver = new MapPaletteResolver(
    this.document,
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
  );

  readonly rounds = input.required<readonly PlannedRound[]>();
  readonly departure = input.required<MapDeparture>();
  /** L'arrêt survolé dans une feuille de route. */
  readonly highlighted = input<string | null>(null);
  /** La couleur de chaque véhicule, par identifiant — la même que dans le tableau. */
  readonly colors = input<ReadonlyMap<string, string>>(new Map());
  /** Les tournées (par clé) montrées pour mémoire : pointillé estompé. */
  readonly muted = input<ReadonlySet<string>>(new Set());
  /** Les tournées (par clé) tracées en tirets : un second passage du véhicule regardé. */
  readonly dashed = input<ReadonlySet<string>>(new Set());

  /** L'arrêt survolé sur la carte, `null` en sortant. */
  readonly hovered = output<string | null>();

  protected readonly state = signal<MapState>('loading');
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  /** Les tournées qui ont des arrêts mais pas de tracé : la carte le dit (L10b-C4). */
  protected readonly untraced = computed(() => untracedVehicles(this.rounds()));
  protected readonly legend = computed(() =>
    mapLegend(this.rounds(), (round) => this.colorOf(round)),
  );

  private map: MapLibreMap | null = null;
  private library: MapLibre | null = null;
  private markers: { readonly orderId: string | null; readonly marker: Marker }[] = [];
  /** Les tournées que le dernier cadrage couvrait : un autre onglet recadre. */
  private fittedOn: string | null = null;

  constructor() {
    afterNextRender(() => void this.start());
    effect(() => {
      const rounds = this.rounds();
      this.colors();
      this.muted();
      this.dashed();
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

  /** La couleur du véhicule ; à défaut, le premier cran de la roue partagée. */
  private colorOf(round: PlannedRound): string {
    return this.colors().get(round.vehicleId) ?? roundColor(0, 1);
  }

  private styleOf(round: PlannedRound): MapRouteStyle {
    if (this.muted().has(round.key)) {
      return 'muted';
    }
    return this.dashed().has(round.key) ? 'dashed' : 'solid';
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
      ensureMaplibreStylesheet(this.document);
      const [library, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
      const protocol = new pmtiles.Protocol();
      library.addProtocol('pmtiles', protocol.tile);
      const streets = new URL(`${tiles.baseUrl}${STREETS_FILE}`, this.document.baseURI).href;
      const relief = new URL(`${tiles.baseUrl}${RELIEF_FILE}`, this.document.baseURI).href;
      await Promise.all(
        [streets, relief].map((url) =>
          registerPmTiles(this.http, pmtiles, protocol, url, tiles.wholeFile),
        ),
      );
      const { gps } = this.departure();
      const map = new library.Map({
        container: this.canvas().nativeElement,
        style: mapStyleOf(
          this.paletteResolver.palette(),
          `pmtiles://${streets}`,
          `pmtiles://${relief}`,
          glyphsUrlOf(this.document.baseURI),
          [],
        ),
        center: [gps.lng, gps.lat],
        zoom: INITIAL_ZOOM,
        attributionControl: { compact: true },
      });
      map.addControl(new library.NavigationControl({ showCompass: false }), 'top-right');
      this.library = library;
      this.map = map;
      this.fittedOn = null;
      map.once('load', () => this.state.set('ready'));
      // Un style refusé n'émet que `error` : sans ceci, « Chargement » à vie.
      map.on('error', () => {
        if (this.state() === 'loading') {
          this.state.set('error');
        }
      });
    } catch {
      this.state.set('error');
    }
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
        : [
            {
              color: this.paletteResolver.toRgba(this.colorOf(round)),
              coordinates: round.geometry,
              style: this.styleOf(round),
            },
          ],
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
    add(
      markerElement(this.document, 'delivery-map__lab', 'L', `${departure.label} — départ`),
      departure.gps,
      null,
    );
    for (const round of rounds) {
      const color = this.colorOf(round);
      const muted = this.muted().has(round.key);
      round.stops.forEach((stop, index) => {
        const point = stopPointOf(stop);
        if (point === null) {
          return;
        }
        const pin = markerElement(
          this.document,
          stopPinClass(stop.windowMissed, muted),
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
    const shown = rounds.map((round) => round.key).join(' ');
    if (this.fittedOn !== shown) {
      this.fit(rounds);
      this.fittedOn = shown;
    }
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
    const bounds = roundsBounds(library, this.departure().gps, rounds);
    map.fitBounds(bounds, { padding: FIT_PADDING, duration: 0 });
  }
}
