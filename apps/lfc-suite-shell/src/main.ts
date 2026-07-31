import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// Entrée navigateur. Le shell héberge les apps en iframe (pas de fédération) :
// bootstrap direct.
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
