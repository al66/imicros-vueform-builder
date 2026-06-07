const required = [
  'POCKET_ID_ISSUER_URL',
  'POCKET_ID_CLIENT_ID',
  'POCKET_ID_CLIENT_SECRET',
  'POCKET_ID_CALLBACK_URL',
  'POCKET_ID_API_URL',
  'DATABASE_URL'
];

function getConfig(env = process.env) {
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(env.PORT || 3000),
    pocketIdIssuerUrl: env.POCKET_ID_ISSUER_URL,
    pocketIdClientId: env.POCKET_ID_CLIENT_ID,
    pocketIdClientSecret: env.POCKET_ID_CLIENT_SECRET,
    pocketIdCallbackUrl: env.POCKET_ID_CALLBACK_URL,
    pocketIdApiUrl: env.POCKET_ID_API_URL,
    databaseUrl: env.DATABASE_URL
  };
}

module.exports = { getConfig };
