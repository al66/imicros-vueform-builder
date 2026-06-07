const { Pool } = require('pg');
const { createApp } = require('./app');
const { getConfig } = require('./config');
const { fetchUserContext } = require('./pocketIdClient');
const { FormsRepository } = require('./repository/formsRepository');

async function start() {
  const config = getConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl
  });

  const repository = new FormsRepository(pool);
  await repository.init();

  const app = createApp({
    getUserContext: (token) =>
      fetchUserContext({
        baseUrl: config.pocketIdApiUrl,
        token,
        apiToken: config.pocketIdApiToken
      }),
    repository
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening on ${config.port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}

module.exports = { start };
