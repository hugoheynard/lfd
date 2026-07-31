import { initFederation } from '@angular-architects/native-federation';

initFederation({ 'lfc-pim-frontend': './remoteEntry.json' })
  .catch((err) => console.error(err))
  .then((_) => import('./bootstrap'))
  .catch((err) => console.error(err));
