import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// Entrée navigateur unique. L'app est browser-only (statique sur Cloudflare
// Pages) : pas de SSR, donc pas de config serveur ni de split browser/server.
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
