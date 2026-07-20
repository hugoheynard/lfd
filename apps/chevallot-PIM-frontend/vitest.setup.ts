// IDE-only Vitest setup (WebStorm right-click / gutter runs). The CI/CLI path
// (`ng test` → @angular/build:unit-test) bootstraps its own TestBed and does
// NOT use this file. Keep both zoneless + jsdom to match that runner.
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// `zoneless` defaults to true — mirrors the app + the CLI test builder.
setupTestBed();
