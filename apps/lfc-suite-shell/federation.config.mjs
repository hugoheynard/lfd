import { withNativeFederation, shareAll } from "@angular-architects/native-federation/config";

// Baseline de plateforme partagée. `strictVersion: true` = un remote buildé hors
// baseline REFUSE de monter (échec bruyant au chargement) plutôt que corrompre
// l'injection en silence — c'est ce qui rend l'indépendance de deploy SÛRE.
// Le garde-fou du skew est le pnpm `catalog:` du workspace : @angular/* en
// lockstep 22.0.x et `fold-ng` épinglé exact (0.7.0) dans le shell ET chaque
// remote. Bumper un singleton = bumper le catalog = rebuild de toute la suite.
export default withNativeFederation({
  name: "lfc-suite-shell",

  shared: {
    ...shareAll(
      { singleton: true, strictVersion: true, requiredVersion: "auto", build: "package" },
      {
        overrides: {
          // includeSecondaries is an opt-out of ignoreUnusedDeps, so all of
          // @angular/core is shared to prevent mismatches.
          "@angular/core": {
            singleton: true,
            strictVersion: true,
            requiredVersion: "auto",
            build: "package",
            includeSecondaries: { keepAll: true },
          },
          // Design system : singleton strict. Le catalog garantit l'exact-match
          // shell↔remotes ; sans ça, deux fold-ng en page = styles/DI cassés.
          "fold-ng": {
            singleton: true,
            strictVersion: true,
            requiredVersion: "auto",
            build: "package",
          },
        },
      },
    ),
  },

  skip: [
    "rxjs/ajax",
    "rxjs/fetch",
    "rxjs/testing",
    "rxjs/webSocket",
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
