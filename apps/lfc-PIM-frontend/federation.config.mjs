import { withNativeFederation, shareAll } from '@angular-architects/native-federation/config';

export default withNativeFederation({
  name: 'lfc-pim-frontend',

  // Le PIM expose SES routes fédérées (`./app` → remote-entry) — donnée, pas de
  // chrome. Le shell les monte sous /pim. Le bootstrap standalone (app.ts) reste
  // l'entrée quand le PIM est déployé seul.
  exposes: {
    './app': './src/app/remote/remote-entry.ts',
  },

  // Même baseline strictVersion que le shell : le pnpm `catalog:` garantit
  // l'exact-match des singletons (@angular/* lockstep, fold-ng 0.7.0) — un skew
  // fait échouer le montage au lieu de casser l'injection en silence.
  shared: {
    ...shareAll(
      { singleton: true, strictVersion: true, requiredVersion: 'auto', build: 'package' },
      {
        overrides: {
          // includeSecondaries is an opt-out of ignoreUnusedDeps, so all of
          // @angular/core is shared to prevent mismatches.
          '@angular/core': {
            singleton: true,
            strictVersion: true,
            requiredVersion: 'auto',
            build: 'package',
            includeSecondaries: { keepAll: true },
          },
          // Design system : singleton strict, exact-match garanti par le catalog.
          'fold-ng': {
            singleton: true,
            strictVersion: true,
            requiredVersion: 'auto',
            build: 'package',
          },
        },
      },
    ),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // Add further packages you don't need at runtime
  ],

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0

  features: {
    // ignoreUnusedDeps is enabled by default now
    // ignoreUnusedDeps: true,

    // Opt-in: groups chunks in remoteEntry.json for smaller metadata file
    denseChunking: true,
  },
});
