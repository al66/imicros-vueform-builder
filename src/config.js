const required = [
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
    pocketIdApiUrl: env.POCKET_ID_API_URL,
    databaseUrl: env.DATABASE_URL,
    pocketIdApiToken: env.POCKET_ID_API_TOKEN || null
  };
}

module.exports = { getConfig };
