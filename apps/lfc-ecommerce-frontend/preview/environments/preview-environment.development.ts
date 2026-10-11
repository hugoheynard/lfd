import type { PreviewEnvironment } from './preview-environment';

/**
 * Le back-office de développement (`ng serve` sur le port 7317). Les deux
 * écritures de l'hôte : le serveur de dev écoute sur `127.0.0.1`, et un
 * navigateur ouvert sur `localhost` est une AUTRE origine.
 */
export const PREVIEW_ENVIRONMENT: PreviewEnvironment = {
  editorOrigins: ['http://localhost:7317', 'http://127.0.0.1:7317'],
};
