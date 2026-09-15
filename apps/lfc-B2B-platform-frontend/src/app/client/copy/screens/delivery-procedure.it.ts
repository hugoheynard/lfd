import {
  DELIVERY_PROCEDURE_MAX_STEPS,
  DELIVERY_STEP_BODY_MAX,
  DELIVERY_STEP_TITLE_MAX,
} from '@lfd/contracts';

import type { DeliveryProcedureCopy } from './delivery-procedure.copy';

export const DELIVERY_PROCEDURE_IT: DeliveryProcedureCopy = {
  entry: 'Procedura di consegna',
  toWrite: 'da redigere',
  stepsNone: 'nessun passaggio',
  stepsOne: '1 passaggio',
  steps: '{n} passaggi',
  removeBusy: 'Eliminazione…',
  removeGroup: 'Confermare l’eliminazione del passaggio',
  editor: {
    loading: 'Caricamento della procedura…',
    loadError: 'Impossibile caricare la procedura di consegna.',
    retry: 'Riprova',
    emptyTitle: 'Nessuna procedura di consegna',
    emptySubtitleEditable:
      'Descrivete, passaggio per passaggio, come il corriere consegna la merce a questo indirizzo.',
    emptySubtitleReadOnly: 'Nessun passaggio è stato descritto per questo indirizzo.',
    addStep: 'Aggiungi un passaggio',
    limitReached: `Una procedura conta al massimo ${DELIVERY_PROCEDURE_MAX_STEPS} passaggi.`,
    stepNumber: (n) => `Passaggio ${n}`,
    moveUp: 'Sposta su il passaggio',
    moveDown: 'Sposta giù il passaggio',
    revise: 'Rifai',
    photoAlt: (title) => `Foto del passaggio «${title}»`,
    conflict: 'La procedura è cambiata nel frattempo: è appena stata ricaricata.',
    writeFailed: 'Salvataggio non riuscito. Riprovate.',
    newStepHeading: 'Nuovo passaggio',
    reviseHeading: (n) => `Rifai il passaggio ${n}`,
    save: 'Salva',
    add: 'Aggiungi il passaggio',
    cancel: 'Annulla',
    removeTitle: 'Elimina questo passaggio',
    removeAction: 'Elimina il passaggio',
    removeExplanation:
      'Il passaggio viene eliminato definitivamente, foto compresa. I successivi salgono di una posizione.',
    removeConfirm: 'Eliminare definitivamente questo passaggio?',
    form: {
      title: 'Titolo',
      titleHint: `Al massimo ${DELIVERY_STEP_TITLE_MAX} caratteri — ciò che si legge a colpo d’occhio.`,
      body: 'Testo',
      bodyHint: `Al massimo ${DELIVERY_STEP_BODY_MAX} caratteri.`,
      optional: 'facoltativo',
      photoLegend: 'Foto',
      photoHint:
        'Una foto della porta, del cancello o del passaggio. Viene alleggerita prima dell’invio.',
      choosePhoto: 'Scegli una foto',
      replacePhoto: 'Sostituisci la foto',
      removePhoto: 'Rimuovi la foto',
      photoPreviewAlt: 'Anteprima della foto del passaggio',
      photoReducing: 'Alleggerimento della foto…',
      photoTooHeavy:
        'Questa foto resta troppo pesante, anche alleggerita. Sceglietene un’altra o ritagliatela.',
      photoUnreadable: 'Questo file non è un’immagine leggibile. Scegliete una foto JPEG o PNG.',
      titleRequired: 'Il titolo è obbligatorio.',
      titleTooLong: `Il titolo supera ${DELIVERY_STEP_TITLE_MAX} caratteri.`,
      bodyTooLong: `Il testo supera ${DELIVERY_STEP_BODY_MAX} caratteri.`,
    },
  },
};
