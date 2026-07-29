import { bootstrapApplication } from '@angular/platform-browser';
import { browserConfig } from './app/app.config.browser';
import { App } from './app/app';

// Entrée **navigateur** : `browserConfig` ajoute Auth0 à la config partagée.
// Le pré-rendu serveur utilise `main.server.ts` → config sans Auth0.
bootstrapApplication(App, browserConfig).catch((err) => console.error(err));
