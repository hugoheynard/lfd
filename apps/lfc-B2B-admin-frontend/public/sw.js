/**
 * Le service worker du back-office — **uniquement** pour les notifications
 * poussées.
 *
 * Aucun cache, aucune interception de requête : Web Push exige un service
 * worker enregistré (c'est lui qui reçoit l'événement quand l'onglet est
 * fermé), et c'est la seule raison pour laquelle celui-ci existe. Un cache hors
 * ligne serait un autre sujet, avec ses propres pièges — une version figée du
 * back-office servie après un déploiement, notamment — et il n'a pas à venir
 * en passager clandestin de la notification.
 *
 * Ce fichier est servi tel quel depuis `public/`, donc il n'est pas compilé :
 * pas de TypeScript, pas d'import, pas de dépendance. C'est voulu — un service
 * worker qui échoue à s'installer le fait en silence.
 */

/* Prendre la main dès l'installation plutôt qu'au prochain chargement : sans
   cela, quelqu'un qui vient d'accepter les notifications devrait recharger
   avant que le worker puisse en recevoir une. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Une notification arrive.
 *
 * La charge est un JSON chiffré de bout en bout par le serveur ; le service de
 * push l'a transportée sans pouvoir la lire. On la rend défensivement : un
 * message qu'on n'arrive pas à lire doit tout de même faire apparaître quelque
 * chose, sinon la personne n'apprend jamais qu'elle a manqué un fait.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'LFC B2B Admin';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      /* Un même fait remplace sa bannière au lieu d'en empiler une seconde. */
      tag: payload.tag || 'lfc-admin',
      data: { url: payload.url || '/' },
    }),
  );
});

/**
 * On clique sur la bannière.
 *
 * Réutiliser un onglet déjà ouvert plutôt qu'en ouvrir un de plus : on finit
 * sinon avec cinq copies du back-office, chacune avec son état, et la personne
 * travaille dans celle où elle n'a pas cliqué.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
