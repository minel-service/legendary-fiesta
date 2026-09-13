const https = require('https');
const { sjekkTilgang, hentRaaToken, hentBrukerSelskap } = require('../_auth');

// Mapping: selskapsnavn → miljøvariabelnavn
const KEY_MAP = {
  'Minel Drøbak Elektriske AS':     process.env.ORDRESTYRING_DROBAK,
  'Minel Kreativ Elektro Ski AS':   process.env.ORDRESTYRING_KREATIV_SKI,
  'Minel Elmontasje AS':            process.env.ORDRESTYRING_ELMONTASJE,
  'Minel Elmontasje Elverum AS':    process.env.ORDRESTYRING_ELMONTASJE_ELVERUM,
  'Minel Gjøvik AS':                process.env.ORDRESTYRING_GJOVIK,
  'Minel Ainstall AS':              process.env.ORDRESTYRING_AINSTALL,
  'Minel Land Elektriske AS':       process.env.ORDRESTYRING_LAND_ELEKTRISKE,
  'Minel Skogvang Installasjon AS': process.env.ORDRESTYRING_SKOGVANG,
  'Minel Gudbrandsdal AS':          process.env.ORDRESTYRING_GUDBRANDSDAL,
};

module.exports = async function (context, req) {
  // CORS preflight. Tidligere sto Allow-Origin paa '*', som lot et hvilket
  // som helst nettsted kalle endepunktet fra en besoekendes nettleser.
  // Appen kaller alltid same-origin, saa ingen wildcard er noedvendig.
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Minel-Token'
      }
    };
    return;
  }

  // Tilgangssjekk. Starter i logg-modus: validerer og logger, men slipper alt
  // gjennom til vi har sett at ekte trafikk baerer gyldig token.
  const tilgang = sjekkTilgang(context, req, 'ordrestyring-proxy');
  if (!tilgang.tillat) {
    context.res = { status: tilgang.status, body: { error: tilgang.melding } };
    return;
  }

  const { company, query, variables, operationName } = req.body || {};

  if (!company || !query) {
    context.res = { status: 400, body: { error: 'Mangler company eller query' } };
    return;
  }

  const apiKey = KEY_MAP[company];
  if (!apiKey) {
    context.res = { status: 403, body: { error: `Ukjent selskap: ${company}` } };
    return;
  }

  // TILGANGSMODELL (besluttet 13.09.2026):
  // LESING er aapen for alle innloggede Minel-ansatte. Konsernbildet, alle
  // selskapers ordrereserve og prosjektlister skal vaere synlig for alle —
  // det er hele poenget med verktoeyet.
  // INPUT er derimot selskapsavgrenset. Dette endepunktet er rent lesende
  // (GraphQL-spoerringer mot Ordrestyring), saa her blokkeres ingenting.
  // Vi slaar likevel opp hvem som spoer, slik at det kan vises i diagnosen.
  const { raa } = hentRaaToken(req);
  let hvem = { grunn: 'ikke slaatt opp' };
  if (raa) { try { hvem = await hentBrukerSelskap(raa); } catch (e) { hvem = { grunn: 'oppslag feilet' }; } }

  try {
    const body = JSON.stringify({ query, variables, operationName });
    const response = await fetch('https://elkonor.ordrestyring.no/api/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body
    });

    const data = await response.json();
    context.res = {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        // Diagnose for logg-modus: lar oss se om ekte trafikk baerer gyldig
        // token uten aa ha Application Insights koblet paa. Klienten logger
        // denne til konsollen. Inneholder ingen tokenverdier.
        'X-Minel-Tilgang': `${tilgang.modus}/${tilgang.vurdering.grunn}/${tilgang.vurdering.kilde}`,
        // Diagnose: hvilket selskap den innloggede mappes til. Brukes av
        // selvtesten i klienten, og blokkerer ingenting.
        'X-Minel-Selskap': hvem.ok ? (hvem.admin ? 'konsern' : hvem.selskap) : ('ukjent: ' + hvem.grunn)
      },
      body: data
    };
  } catch (e) {
    context.res = {
      status: 502,
      body: { error: 'Proxy-feil: ' + e.message }
    };
  }
};
