import { bootstrapApplication } from "@angular/platform-browser";

import { appConfig } from "./app/app.config";
import { App } from "./app/app";

// Bootstrap réel de l'app hôte. `main.ts` initialise d'abord la fédération
// (`initFederation('federation.manifest.json')`) puis importe ce module : à ce
// stade les singletons partagés et les remotes du manifest sont connus.
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
