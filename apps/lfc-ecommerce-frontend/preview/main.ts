import { PREVIEW_ENVIRONMENT } from './environments/preview-environment';
import { shadowBrowserStorage } from './app/composition/memory-storage';
import { PreviewHost } from './app/host/preview-host';

// L'APPLICATION D'APERÇU des textes de la boutique (plan
// `plan-textes-de-la-boutique.md`, §10 B3). Le stockage du navigateur est
// remplacé AVANT que la boutique ne démarre : aucun de ses stores ne verra
// jamais le vrai.
const storages = shadowBrowserStorage(window);

new PreviewHost(window, PREVIEW_ENVIRONMENT.editorOrigins, storages)
  .start()
  .catch((err: unknown) => console.error(err));
