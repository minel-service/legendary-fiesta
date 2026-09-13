const { BlobServiceClient } = require('@azure/storage-blob');
const { sjekkTilgang, sjekkSelskap } = require('../_auth');

// ════════════════════════════════════════════
// PROSJEKTLAGRING — erstatter broen minel-sp-bridge
// ════════════════════════════════════════════
// Bakgrunn: broen tar filnavn som query-parameter og sjekker ikke HVEM som
// skriver. Enhver innlogget ansatt kunne derfor skrive til et annet selskaps
// prosjektfil ved aa kalle den direkte — sperren laa kun i nettleseren.
//
// Her utledes filnavnet server-side fra selskapsnavnet, og skriving krever at
// brukeren faktisk hoerer til selskapet. Samme blob-container og samme
// filnavn som broen bruker, saa dette er en ren erstatning uten datamigrering.
//
// TILGANGSMODELL (13.09.2026):
//   GET  — aapen for alle innloggede Minel-ansatte (konsernbildet).
//   PUT  — kun eget selskap. Konsern (372 Minel AS) naar alle.
const FILE_MAP = {
  'Minel Drobak Elektriske AS':     'kapasitet_drobak.json',
  'Minel Drøbak Elektriske AS':     'kapasitet_drobak.json',
  'Minel Kreativ Elektro Ski AS':   'kapasitet_kreativ_ski.json',
  'Minel Elmontasje AS':            'kapasitet_elmontasje.json',
  'Minel Elmontasje Elverum AS':    'kapasitet_elmontasje_elverum.json',
  'Minel Gjøvik AS':                'kapasitet_gjovik.json',
  'Minel Ainstall AS':              'kapasitet_ainstall.json',
  'Minel Land Elektriske AS':       'kapasitet_land_elektriske.json',
  'Minel Skogvang Installasjon AS': 'kapasitet_skogvang.json',
  'Minel Gudbrandsdal AS':          'kapasitet_gudbrandsdal.json',
};

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
        'Access-Control-Allow-Headers': 'Content-Type, X-Minel-Token'
      }
    };
    return;
  }

  const tilgang = sjekkTilgang(context, req, 'prosjekter');
  if (!tilgang.tillat) {
    context.res = { status: tilgang.status, body: tilgang.melding };
    return;
  }

  const selskap = (req.query && req.query.selskap) || '';
  const fil = FILE_MAP[selskap];
  if (!fil) {
    context.res = { status: 400, body: 'Ukjent selskap' };
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
    blob = cont.getBlockBlobClient(fil);
  } catch (e) {
    context.res = { status: 500, body: 'Kunne ikke koble til lagring: ' + e.message };
    return;
  }

  if (req.method === 'GET') {
    try {
      const buf = await blob.downloadToBuffer();
      let tekst = buf.toString('utf8');
      // Eldre data fra broen kan ligge dobbeltpakket som {type:'Buffer',data:[...]}
      try {
        const p = JSON.parse(tekst);
        if (p && p.type === 'Buffer' && Array.isArray(p.data)) tekst = Buffer.from(p.data).toString('utf8');
      } catch (_) { }
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: tekst };
    } catch (e) {
      if (e.statusCode === 404 || e.errorCode === 'BlobNotFound') {
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' };
      } else {
        context.res = { status: 500, body: 'Lesefeil: ' + e.message };
      }
    }
    return;
  }

  if (req.method === 'PUT') {
    // Her ligger hele poenget: skriving krever at du hoerer til selskapet.
    const eier = await sjekkSelskap(context, req, selskap, 'prosjekter');
    if (!eier.tillat) {
      context.res = { status: eier.status, body: eier.melding };
      return;
    }

    let data;
    try {
      data = JSON.parse(lesKropp(req.body));
    } catch (e) {
      context.res = { status: 400, body: 'Ugyldig JSON' };
      return;
    }
    // Vern mot aa toemme en selskapsfil ved en feil i klienten.
    if (!Array.isArray(data)) {
      context.res = { status: 400, body: 'Forventer en liste med prosjekter' };
      return;
    }

    try {
      const buf = Buffer.from(JSON.stringify(data), 'utf8');
      await blob.upload(buf, buf.length, {
        overwrite: true,
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, selskap, antall: data.length })
      };
    } catch (e) {
      context.res = { status: 500, body: 'Skrivefeil: ' + e.message };
    }
    return;
  }

  context.res = { status: 405, body: 'Method not allowed' };
};
