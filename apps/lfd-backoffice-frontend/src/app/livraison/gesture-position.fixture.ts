import type { GeolocationSource } from './gesture-position';

/** Un téléphone qui donne toujours ce point — et compte les relevés demandés. */
export function fixedGeolocation(
  latitude: number,
  longitude: number,
  accuracy: number,
): GeolocationSource & { readonly calls: PositionOptions[] } {
  const calls: PositionOptions[] = [];
  return {
    calls,
    getCurrentPosition(success, _error, options) {
      calls.push(options ?? {});
      const coords: GeolocationCoordinates = {
        latitude,
        longitude,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({ latitude, longitude, accuracy }),
      };
      const position: GeolocationPosition = { coords, timestamp: 0, toJSON: () => ({}) };
      success(position);
    },
  };
}

/** Un téléphone dont le livreur a refusé la géolocalisation. */
export function refusingGeolocation(): GeolocationSource {
  return {
    getCurrentPosition(_success, error) {
      const refusal: GeolocationPositionError = {
        code: 1,
        message: 'refusé',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };
      error?.(refusal);
    },
  };
}
