const https = require('https');

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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    context.res = {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    };
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
        'Access-Control-Allow-Origin': '*'
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
