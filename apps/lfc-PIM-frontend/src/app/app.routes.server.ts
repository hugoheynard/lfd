import { RenderMode, type ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Le back-office lit l'API au chargement : le prérendu au build n'aurait
    // rien à afficher (et tenterait un appel réseau depuis le serveur de build).
    path: '**',
    renderMode: RenderMode.Client,
  },
];
