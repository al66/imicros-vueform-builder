const request = require('supertest');
const { createApp } = require('../../src/app');

function buildRepositoryMock() {
  return {
    listByGroups: jest.fn(),
    getByIdAndGroups: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
  };
}

describe('form service unit tests', () => {
  function buildAuthMock(user = { userId: 'u1', groups: ['g1'] }) {
    return {
      requireAuth: (req, _res, next) => {
        req.user = user;
        next();
      },
      login: jest.fn(async (_req, res) => res.redirect('https://pocket-id.local/auth')),
      callback: jest.fn(async (_req, res) => res.redirect('/')),
      logout: jest.fn(async (_req, res) => res.status(204).send())
    };
  }

  test('redirects unauthenticated root requests to login', async () => {
    const repository = buildRepositoryMock();
    const auth = {
      requireAuth: (_req, res, _next) => res.redirect('/auth/login'),
      login: jest.fn(async (_req, res) => res.redirect('https://pocket-id.local/auth')),
      callback: jest.fn(async (_req, res) => res.redirect('/')),
      logout: jest.fn(async (_req, res) => res.status(204).send())
    };
    const app = createApp({ repository, auth });

    const response = await request(app).get('/');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/auth/login');
  });

  test('exposes auth endpoints', async () => {
    const repository = buildRepositoryMock();
    const auth = buildAuthMock();
    const app = createApp({ repository, auth });

    const loginResponse = await request(app).get('/auth/login');
    expect(loginResponse.status).toBe(302);
    expect(auth.login).toHaveBeenCalled();

    const callbackResponse = await request(app).get('/auth/callback?code=abc&state=xyz');
    expect(callbackResponse.status).toBe(302);
    expect(auth.callback).toHaveBeenCalled();

    const logoutResponse = await request(app).post('/auth/logout');
    expect(logoutResponse.status).toBe(204);
    expect(auth.logout).toHaveBeenCalled();
  });

  test('shows info note when user has no groups', async () => {
    const repository = buildRepositoryMock();
    const auth = buildAuthMock({ userId: 'u1', groups: [] });
    const app = createApp({
      repository,
      auth
    });

    const response = await request(app).get('/api/forms');

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("don't belong to any group");
    expect(response.body.forms).toEqual([]);
    expect(repository.listByGroups).not.toHaveBeenCalled();
  });

  test('lists only forms for authorized groups', async () => {
    const repository = buildRepositoryMock();
    repository.listByGroups.mockResolvedValue([{ id: 'f1', groupId: 'g1', version: 1 }]);
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1'] });
    const app = createApp({
      repository,
      auth
    });

    const response = await request(app).get('/api/forms');

    expect(response.status).toBe(200);
    expect(response.body.forms).toEqual([{ id: 'f1', groupId: 'g1', version: 1 }]);
    expect(repository.listByGroups).toHaveBeenCalledWith(['g1']);
  });

  test('creates a form with automatic single group selection', async () => {
    const repository = buildRepositoryMock();
    repository.create.mockResolvedValue({ id: 'f1', groupId: 'g1', version: 1, versionRemark: 'initial' });
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1'] });

    const app = createApp({
      repository,
      auth
    });

    const response = await request(app)
      .post('/api/forms')
      .send({ description: 'desc', versionRemark: 'initial', form: { fields: [] } });

    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({
      groupId: 'g1',
      description: 'desc',
      versionRemark: 'initial',
      form: { fields: [] },
      userId: 'u1'
    });
    expect(response.body.form.version).toBe(1);
  });

  test('requires group selection when user has multiple groups', async () => {
    const repository = buildRepositoryMock();
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1', 'g2'] });
    const app = createApp({
      repository,
      auth
    });

    const response = await request(app)
      .post('/api/forms')
      .send({ description: 'desc', versionRemark: 'remark', form: { fields: [] } });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('groupId is required');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('updates a form and requires version remark', async () => {
    const repository = buildRepositoryMock();
    repository.update.mockResolvedValue({ id: 'f1', version: 2, versionRemark: 'updated' });
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1'] });

    const app = createApp({
      repository,
      auth
    });

    const missingRemark = await request(app)
      .put('/api/forms/f1')
      .send({ description: 'desc', form: { fields: ['a'] } });

    expect(missingRemark.status).toBe(400);

    const valid = await request(app)
      .put('/api/forms/f1')
      .send({ description: 'desc2', versionRemark: 'updated', form: { fields: ['a'] } });

    expect(valid.status).toBe(200);
    expect(repository.update).toHaveBeenCalledWith({
      formId: 'f1',
      groups: ['g1'],
      description: 'desc2',
      versionRemark: 'updated',
      form: { fields: ['a'] },
      userId: 'u1'
    });
    expect(valid.body.form.version).toBe(2);
  });

  test('returns the root UI page', async () => {
    const repository = buildRepositoryMock();
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1'] });
    const app = createApp({
      repository,
      auth
    });

    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Available forms');
  });

  test('deletes a form in an authorized group', async () => {
    const repository = buildRepositoryMock();
    repository.remove.mockResolvedValue(true);
    const auth = buildAuthMock({ userId: 'u1', groups: ['g1'] });

    const app = createApp({
      repository,
      auth
    });

    const response = await request(app).delete('/api/forms/f1');

    expect(response.status).toBe(204);
    expect(repository.remove).toHaveBeenCalledWith({ formId: 'f1', groups: ['g1'] });
  });
});
