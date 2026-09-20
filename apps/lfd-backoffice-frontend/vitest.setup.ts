// IDE-only Vitest setup (WebStorm right-click / gutter runs). Le chemin CI/CLI
// (`ng test` → @angular/build:unit-test) amorce son propre TestBed et n'utilise
// PAS ce fichier. On garde zoneless + jsdom pour coller à ce runner.
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed();
