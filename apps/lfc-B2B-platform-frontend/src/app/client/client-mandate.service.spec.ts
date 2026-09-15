import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CustomerMandateView } from '@lfd/contracts';
import { of } from 'rxjs';

import { AuthFacade } from '../auth/auth.facade';
import { ClientMandate } from './client-mandate.service';

const DRAFT: CustomerMandateView = {
  id: 'mdt_1',
  reference: 'LFD-MDT-0001',
  status: 'draft',
  scheme: 'CORE',
  hasProof: false,
  proofFileName: '',
  acceptedAt: null,
};

const MANDATE_URL = /\/companies\/cmp_1\/mandate$/u;

/** Laisse filer le jeton (une promesse) jusqu'à la requête. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('ClientMandate', () => {
  let mandates: ClientMandate;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { accessToken$: () => of('jeton-de-test') } },
      ],
    });
    mandates = TestBed.inject(ClientMandate);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lit le mandat avec le jeton, et tient `null` pour « aucun mandat »', async () => {
    const reading = mandates.reload('cmp_1');
    await tick();
    const request = http.expectOne((r) => MANDATE_URL.test(r.url));
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    request.flush(null);
    await reading;

    expect(mandates.status()).toBe('ready');
    expect(mandates.mandate()).toBeNull();
  });

  /**
   * Après un RIB enregistré, la relecture ne part que si le mandat a déjà été
   * lu : sans carte montrée (drapeau fermé), elle serait refusée en 409.
   */
  it('`refresh` ne relit que ce qui a déjà été lu', async () => {
    await mandates.refresh('cmp_1');
    await tick();
    http.expectNone((r) => MANDATE_URL.test(r.url));

    mandates.ensure('cmp_1');
    await tick();
    http.expectOne((r) => MANDATE_URL.test(r.url)).flush(DRAFT);
    http
      .expectOne((r) => r.url.endsWith('/mandate-options'))
      .flush({ options: null, issuerScheme: 'CORE' });
    await tick();

    const refreshing = mandates.refresh('cmp_1');
    await tick();
    http.expectOne((r) => MANDATE_URL.test(r.url)).flush({ ...DRAFT, status: 'revoked' });
    await refreshing;
    expect(mandates.mandate()?.status).toBe('revoked');
  });

  it('générer pose la vue rendue par le `POST` comme lecture partagée', async () => {
    const generating = mandates.generate('cmp_1');
    await tick();
    const request = http.expectOne((r) => MANDATE_URL.test(r.url));
    expect(request.request.method).toBe('POST');
    request.flush(DRAFT);

    expect(await generating).toBeNull();
    expect(mandates.mandate()).toEqual(DRAFT);
    expect(mandates.status()).toBe('ready');
  });

  it('un refus de génération rend le message du serveur, sans toucher la lecture', async () => {
    const generating = mandates.generate('cmp_1');
    await tick();
    http
      .expectOne((r) => MANDATE_URL.test(r.url))
      .flush(
        { message: 'Enregistrez d’abord votre RIB.' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(await generating).toBe('Enregistrez d’abord votre RIB.');
    expect(mandates.mandate()).toBeNull();
  });

  it('dépose le scan en multipart `file`, puis relit', async () => {
    const file = new File(['%PDF-1.7'], 'mandat-signe.pdf', { type: 'application/pdf' });
    const uploading = mandates.attachProof('cmp_1', file);
    await tick();
    const put = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/mandate/proof'));
    expect(put.request.method).toBe('PUT');
    const body = put.request.body;
    expect(body instanceof FormData ? body.get('file') : null).toBeInstanceOf(File);
    put.flush(null, { status: 204, statusText: 'No Content' });
    await tick();

    http
      .expectOne((r) => MANDATE_URL.test(r.url))
      .flush({ ...DRAFT, hasProof: true, proofFileName: 'mandat-signe.pdf' });
    expect(await uploading).toBeNull();
    expect(mandates.mandate()?.hasProof).toBe(true);
  });

  it('un dépôt refusé rend le message du serveur, et ne relit pas', async () => {
    const file = new File(['MZ'], 'virus.exe');
    const uploading = mandates.attachProof('cmp_1', file);
    await tick();
    http
      .expectOne((r) => r.url.endsWith('/mandate/proof'))
      .flush(
        { message: 'Le fichier doit être un PDF ou une image.' },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(await uploading).toBe('Le fichier doit être un PDF ou une image.');
    http.expectNone((r) => MANDATE_URL.test(r.url));
  });

  it('lit les options enveloppées, et tient `null` pour « pas de RIB »', async () => {
    const reading = mandates.loadOptions('cmp_1');
    expect(mandates.optionsStatus()).toBe('loading');
    await tick();
    const request = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/mandate-options'));
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    request.flush({ options: null, issuerScheme: null });
    await reading;

    expect(mandates.optionsStatus()).toBe('ready');
    expect(mandates.options()).toBeNull();
  });

  /**
   * Le schéma de l'émetteur vit dans l'enveloppe des options, et la CARTE en a
   * besoin avant tout panneau : `ensure` lit donc les deux, une seule fois.
   */
  it('`ensure` lit le mandat ET le schéma de l’émetteur, une fois par société', async () => {
    expect(mandates.issuerScheme()).toBeNull();
    mandates.ensure('cmp_1');
    mandates.ensure('cmp_1');
    await tick();
    http.expectOne((r) => MANDATE_URL.test(r.url)).flush(null);
    http
      .expectOne((r) => r.url.endsWith('/companies/cmp_1/mandate-options'))
      .flush({ options: null, issuerScheme: 'B2B' });
    await tick();

    expect(mandates.issuerScheme()).toBe('B2B');
  });

  /** Plan §9 #4 : réécrire les zones révoque le brouillon — le mandat se relit avec elles. */
  it('enregistrer les options relit le mandat ET les options', async () => {
    const saving = mandates.saveOptions('cmp_1', {
      debtorReference: 'C-9P2X4B',
      contractNumber: '',
    });
    await tick();
    const put = http.expectOne((r) => r.url.endsWith('/mandate-options') && r.method === 'PUT');
    expect(put.request.body).toEqual({ debtorReference: 'C-9P2X4B', contractNumber: '' });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await tick();

    http.expectOne((r) => MANDATE_URL.test(r.url)).flush({ ...DRAFT, status: 'revoked' });
    http
      .expectOne((r) => r.url.endsWith('/mandate-options') && r.method === 'GET')
      .flush({
        options: { debtorReference: 'C-9P2X4B', contractNumber: '' },
        issuerScheme: 'CORE',
      });
    expect(await saving).toBeNull();
    expect(mandates.mandate()?.status).toBe('revoked');
    expect(mandates.options()?.debtorReference).toBe('C-9P2X4B');
  });

  it('un refus des options rend le message du serveur, et ne relit rien', async () => {
    const saving = mandates.saveOptions('cmp_1', { debtorReference: 'X', contractNumber: 'Y' });
    await tick();
    http
      .expectOne((r) => r.url.endsWith('/mandate-options'))
      .flush(
        {
          code: 'payments.mandate_options.bound_to_active_mandate',
          message: 'Le mandat actif porte déjà ces zones.',
        },
        { status: 409, statusText: 'Conflict' },
      );

    expect(await saving).toBe('Le mandat actif porte déjà ces zones.');
    http.expectNone((r) => MANDATE_URL.test(r.url));
  });

  it('récupère le PDF en blob avec le jeton, `?inline=1` pour un onglet', async () => {
    const reading = mandates.document('cmp_1', true);
    await tick();
    const request = http.expectOne((r) => r.url.endsWith('/companies/cmp_1/mandate/document.pdf'));
    expect(request.request.params.get('inline')).toBe('1');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    request.flush(new Blob(['%PDF']));
    expect(await reading).toBeInstanceOf(Blob);

    const downloading = mandates.document('cmp_1', false);
    await tick();
    const plain = http.expectOne((r) => r.url.endsWith('/mandate/document.pdf'));
    expect(plain.request.params.has('inline')).toBe(false);
    plain.flush(new Blob(['%PDF']));
    await downloading;
  });
});
