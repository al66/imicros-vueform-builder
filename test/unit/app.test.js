const request = require('supertest');
const { createApp } = require('../../src/app');

function buildRepositoryMock() {
  return {
    listByGroups: jest.fn(),
    getByIdAndGroups: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  };
}

describe('form service unit tests', () => {
  test('shows info note when user has no groups', async () => {
    const repository = buildRepositoryMock();
    const app = createApp({
      repository,
      getUserContext: jest.fn().mockResolvedValue({ userId: 'u1', groups: [] })
    });

    const response = await request(app)
      .get('/api/forms')
      .set('Authorization', ['Bearer', 'test-token'].join(' '));

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("don't belong to any group");
    expect(response.body.forms).toEqual([]);
    expect(repository.listByGroups).not.toHaveBeenCalled();
  });

  test('lists only forms for authorized groups', async () => {
    const repository = buildRepositoryMock();
    repository.listByGroups.mockResolvedValue([{ id: 'f1', groupId: 'g1', version: 1 }]);
    const app = createApp({
      repository,
      getUserContext: jest.fn().mockResolvedValue({ userId: 'u1', groups: ['g1'] })
    });

    const response = await request(app)
      .get('/api/forms')
      .set('Authorization', ['Bearer', 'test-token'].join(' '));

    expect(response.status).toBe(200);
    expect(response.body.forms).toEqual([{ id: 'f1', groupId: 'g1', version: 1 }]);
    expect(repository.listByGroups).toHaveBeenCalledWith(['g1']);
  });

  test('creates a form with automatic single group selection', async () => {
    const repository = buildRepositoryMock();
    repository.create.mockResolvedValue({ id: 'f1', groupId: 'g1', version: 1, versionRemark: 'initial' });

    const app = createApp({
      repository,
      getUserContext: jest.fn().mockResolvedValue({ userId: 'u1', groups: ['g1'] })
    });

    const response = await request(app)
      .post('/api/forms')
      .set('Authorization', ['Bearer', 'test-token'].join(' '))
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
    const app = createApp({
      repository,
      getUserContext: jest.fn().mockResolvedValue({ userId: 'u1', groups: ['g1', 'g2'] })
    });

    const response = await request(app)
      .post('/api/forms')
      .set('Authorization', ['Bearer', 'test-token'].join(' '))
      .send({ description: 'desc', versionRemark: 'remark', form: { fields: [] } });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('groupId is required');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('updates a form and requires version remark', async () => {
    const repository = buildRepositoryMock();
    repository.update.mockResolvedValue({ id: 'f1', version: 2, versionRemark: 'updated' });

    const app = createApp({
      repository,
      getUserContext: jest.fn().mockResolvedValue({ userId: 'u1', groups: ['g1'] })
    });

    const missingRemark = await request(app)
      .put('/api/forms/f1')
      .set('Authorization', ['Bearer', 'test-token'].join(' '))
      .send({ description: 'desc', form: { fields: ['a'] } });

    expect(missingRemark.status).toBe(400);

    const valid = await request(app)
      .put('/api/forms/f1')
      .set('Authorization', ['Bearer', 'test-token'].join(' '))
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
});
