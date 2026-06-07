const { Pool } = require('pg');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { FormsRepository } = require('../../src/repository/formsRepository');

const hasDbConfig = Boolean(
  process.env.DATABASE_URL
  || (process.env.PGHOST && process.env.PGPORT && process.env.PGDATABASE)
);

const suite = hasDbConfig ? describe : describe.skip;

suite('integration with PostgreSQL', () => {
  let pool;
  let repository;
  let app;
  const auth = {
    requireAuth: (req, _res, next) => {
      req.user = { userId: 'integration-user', groups: ['group-a', 'group-b'] };
      next();
    },
    login: async (_req, res) => res.redirect('https://pocket-id.local/auth'),
    callback: async (_req, res) => res.redirect('/'),
    logout: async (_req, res) => res.status(204).send()
  };

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL
      || `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'postgres'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'forms'}`;
    pool = new Pool({ connectionString });
    repository = new FormsRepository(pool);
    await repository.init();

    app = createApp({
      repository,
      auth
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE form_versions, forms RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('creates, lists and versions forms with group isolation', async () => {
    const createA = await request(app)
      .post('/api/forms')
      .send({
        groupId: 'group-a',
        description: 'Form A',
        versionRemark: 'initial version',
        form: { title: 'A' }
      });

    expect(createA.status).toBe(201);
    expect(createA.body.form.version).toBe(1);

    const createdId = createA.body.form.id;

    const update = await request(app)
      .put(`/api/forms/${createdId}`)
      .send({
        description: 'Form A updated',
        versionRemark: 'new field',
        form: { title: 'A2' }
      });

    expect(update.status).toBe(200);
    expect(update.body.form.version).toBe(2);
    expect(update.body.form.versionRemark).toBe('new field');

    const list = await request(app).get('/api/forms');

    expect(list.status).toBe(200);
    expect(list.body.forms).toHaveLength(1);
    expect(list.body.forms[0].groupId).toBe('group-a');
    expect(list.body.forms[0].version).toBe(2);
    expect(list.body.forms[0].description).toBe('Form A updated');
  });

  test('deletes a form', async () => {
    const createA = await request(app)
      .post('/api/forms')
      .send({
        groupId: 'group-a',
        description: 'Form A',
        versionRemark: 'initial version',
        form: { title: 'A' }
      });

    expect(createA.status).toBe(201);

    const response = await request(app).delete(`/api/forms/${createA.body.form.id}`);

    expect(response.status).toBe(204);

    const list = await request(app).get('/api/forms');

    expect(list.status).toBe(200);
    expect(list.body.forms).toHaveLength(0);
  });
});
