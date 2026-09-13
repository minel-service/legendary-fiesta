const { BlobServiceClient } = require('@azure/storage-blob');

// Denne funksjonen haandterer KUN historikkfilen. Filnavnet tas aldri fra
// klienten, slik at endepunktet ikke kan brukes til aa naa andre blobs.
// (Broen minel-sp-bridge tar filnavn som query-parameter og trenger derfor
// en hviteliste — det problemet unngaar vi helt her.)
const BLOB_NAVN = 'kapasitet_historikk.json';

// Samme tenant som MSAL-oppsettet i src/index.html. Ikke en hemmelighet —
// tenant-id ligger allerede i authority-URL-en i klienten.
const TENANT = '7ee2ac67-421e-4ac2-8998-f1f3e0c10fa7';

// Maks ett aar med ukentlige snapshots.
const MAKS_SNAPSHOTS = 52;

// Azure Static Web Apps bruker Authorization-headeren til sin egen
// autentisering og erstatter innholdet foer det naar managed functions.
// MSAL-tokenet sendes derfor i X-Minel-Token, som plattformen lar vaere i fred.
// Authorization beholdes som reserve.
function hentRaaToken(req) {
  const h = (req && req.headers) || {};
  const egen = h['x-minel-token'] || h['X-Minel-Token'];
  if (egen) return { raa: String(egen), kilde: 'x-minel-token' };
  const auth = h.authorization || h.Authorization || '';
  if (auth.startsWith('Bearer ')) return { raa: auth.slice(7), kilde: 'authorization' };
  return { raa: '', kilde: 'ingen' };
}

// Dekoder payload og verifiserer tenant, slik broen gjoer.
// NB: signaturen verifiseres ikke — samme nivaa som resten av loesningen.
function sjekkToken(req) {
  const { raa, kilde } = hentRaaToken(req);
  if (!raa) return { ok: false, status: 401, feil: 'Unauthorized (ingen token-header)' };
  try {
    const deler = raa.split('.');
    if (deler.length < 2) return { ok: false, status: 401, feil: 'Bad token (kilde: ' + kilde + ')' };
    // JWT bruker base64url — bytt tegn og fyll paa padding foer dekoding.
    let b64 = deler[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (payload.tid !== TENANT) {
      // Diagnose uten aa lekke verdier: hvilken header, og fantes tid i det hele tatt.
      return {
        ok: false, status: 403,
        feil: 'Wrong tenant (kilde: ' + kilde + ', tid: ' + (payload.tid ? 'satt men ulik' : 'mangler') + ')'
      };
    }
    if (payload.exp && payload.exp * 1000 < Date.now()) return { ok: false, status: 401, feil: 'Token expired' };
    return { ok: true };
  } catch (e) {
    return { ok: false, status: 401, feil: 'Bad token (kilde: ' + kilde + ')' };
  }
}

// Kroppen kan komme som streng, Buffer eller serialisert Buffer.
function lesKropp(body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body && body.type === 'Buffer' && Array.isArray(body.data)) return Buffer.from(body.data).toString('utf8');
  return JSON.stringify(body);
}

module.exports = async function (context, req) {
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      }
    };
    return;
  }

  const tok = sjekkToken(req);
  if (!tok.ok) {
    context.res = { status: tok.status, body: tok.feil };
    return;
  }

  const connStr = process.env.STORAGE_CONNSTR;
  if (!connStr) {
    context.res = { status: 500, body: 'STORAGE_CONNSTR mangler i appinnstillingene' };
    return;
  }

  let blob;
  try {
    const svc = BlobServiceClient.fromConnectionString(connStr);
    const cont = svc.getContainerClient(process.env.STORAGE_CONTAINER || 'minel-data');
    blob = cont.getBlockBlobClient(BLOB_NAVN);
  } catch (e) {
    context.res = { status: 500, body: 'Kunne ikke koble til lagring: ' + e.message };
    return;
  }

  if (req.method === 'GET') {
    try {
      const buf = await blob.downloadToBuffer();
      let tekst = buf.toString('utf8');
      // Eldre data kan ligge dobbeltpakket som {type:'Buffer',data:[...]}
      try {
        const p = JSON.parse(tekst);
        if (p && p.type === 'Buffer' && Array.isArray(p.data)) tekst = Buffer.from(p.data).toString('utf8');
      } catch (_) { }
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: tekst };
    } catch (e) {
      // Finnes ikke enda = tom historikk, ikke en feil.
      if (e.statusCode === 404 || e.errorCode === 'BlobNotFound') {
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' };
      } else {
        context.res = { status: 500, body: 'Lesefeil: ' + e.message };
      }
    }
    return;
  }

  if (req.method === 'PUT') {
    let data;
    try {
      data = JSON.parse(lesKropp(req.body));
    } catch (e) {
      context.res = { status: 400, body: 'Ugyldig JSON' };
      return;
    }
    // Vern mot aa overskrive historikken med noe som ikke er en snapshot-liste.
    if (!Array.isArray(data)) {
      context.res = { status: 400, body: 'Forventer en liste med snapshots' };
      return;
    }
    if (data.length > MAKS_SNAPSHOTS) data = data.slice(0, MAKS_SNAPSHOTS);
    try {
      const buf = Buffer.from(JSON.stringify(data), 'utf8');
      await blob.upload(buf, buf.length, {
        overwrite: true,
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, antall: data.length })
      };
    } catch (e) {
      context.res = { status: 500, body: 'Skrivefeil: ' + e.message };
    }
    return;
  }

  context.res = { status: 405, body: 'Method not allowed' };
};
