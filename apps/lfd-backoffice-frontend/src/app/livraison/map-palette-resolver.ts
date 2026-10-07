import { MAP_PALETTE_TOKENS, type MapPalette } from './delivery-map-style';

/**
 * **Les couleurs de la carte, lues dans les tokens fold au moment de
 * dessiner** — sorties du composant `DeliveryMap`. MapLibre ne lit pas
 * `var()` : chaque token est résolu en couleur calculée par une sonde posée
 * dans l'hôte, pour hériter des mêmes variables que l'écran.
 */
export class MapPaletteResolver {
  constructor(
    private readonly document: Document,
    private readonly host: HTMLElement,
  ) {}

  palette(): MapPalette {
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
      label: color('label'),
      labelMinor: color('labelMinor'),
    };
  }

  /**
   * Les tokens fold sont souvent des `color-mix()`, que le navigateur rend en
   * `color(srgb …)` : MapLibre refuse cette forme et le style entier avec, la
   * carte restait sur « Chargement » sans rien dire (vu le 2026-09-29). Un
   * pixel peint par le canevas 2D rend toujours des octets sRGB.
   */
  toRgba(color: string): string {
    const context = this.document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    });
    if (context === null) {
      return color;
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(Math.round((alpha / 255) * 1000) / 1000)})`;
  }

  /** MapLibre ne lit pas `var()` : chaque token est résolu en couleur calculée. */
  private resolve(token: string): string {
    const probe = this.document.createElement('span');
    probe.style.color = `var(${token})`;
    this.host.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return this.toRgba(color);
  }
}
