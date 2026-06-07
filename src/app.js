const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

function resolveGroup(groupId, groups) {
  if (groups.length === 1) {
    return groups[0];
  }

  if (!groupId) {
    return null;
  }

  return groups.includes(groupId) ? groupId : null;
}

function createApp({ auth, repository }) {
  const app = express();
  const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });
  app.use(express.json({ limit: '2mb' }));
  const indexPath = path.resolve(__dirname, '../public/index.html');
  let indexHtml = null;
  try {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    indexHtml = null;
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/auth/login', authRateLimiter, async (req, res, next) => {
    try {
      await auth.login(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.get('/auth/callback', authRateLimiter, async (req, res, next) => {
    try {
      await auth.callback(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/logout', authRateLimiter, async (req, res, next) => {
    try {
      await auth.logout(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.get('/', authRateLimiter, auth.requireAuth, (_req, res, next) => {
    if (!indexHtml) {
      return next(new Error(`UI file not found: ${indexPath}`));
    }
    return res.type('html').send(indexHtml);
  });

  app.use('/api', authRateLimiter, auth.requireAuth);

  app.get('/api/forms', async (req, res, next) => {
    try {
      const { groups } = req.user;
      if (groups.length === 0) {
        return res.status(200).json({
          message: "You don't belong to any group and cannot use this service.",
          forms: []
        });
      }

      const forms = await repository.listByGroups(groups);
      return res.json({ forms });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/forms/:id', async (req, res, next) => {
    try {
      const { groups } = req.user;
      if (groups.length === 0) {
        return res.status(403).json({ message: 'No group access' });
      }
      const form = await repository.getByIdAndGroups(req.params.id, groups);
      if (!form) {
        return res.status(404).json({ message: 'Form not found' });
      }
      return res.json({ form });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/forms', async (req, res, next) => {
    try {
      const { groups, userId } = req.user;
      if (groups.length === 0) {
        return res.status(403).json({ message: 'No group access' });
      }

      const { groupId, description, versionRemark, form } = req.body || {};

      if (!description || !versionRemark || form === undefined) {
        return res.status(400).json({ message: 'description, versionRemark and form are required' });
      }

      const targetGroup = resolveGroup(groupId, groups);
      if (!targetGroup) {
        if (groups.length > 1) {
          return res.status(400).json({ message: 'groupId is required and must be one of your groups' });
        }
        return res.status(403).json({ message: 'Not allowed for this group' });
      }

      const created = await repository.create({
        groupId: targetGroup,
        description,
        versionRemark,
        form,
        userId
      });

      return res.status(201).json({ form: created });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/forms/:id', async (req, res, next) => {
    try {
      const { groups, userId } = req.user;
      if (groups.length === 0) {
        return res.status(403).json({ message: 'No group access' });
      }

      const { description, versionRemark, form } = req.body || {};
      if (!description || !versionRemark || form === undefined) {
        return res.status(400).json({ message: 'description, versionRemark and form are required' });
      }

      const updated = await repository.update({
        formId: req.params.id,
        groups,
        description,
        versionRemark,
        form,
        userId
      });

      if (!updated) {
        return res.status(404).json({ message: 'Form not found' });
      }

      return res.json({ form: updated });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/forms/:id', async (req, res, next) => {
    try {
      const { groups } = req.user;
      if (groups.length === 0) {
        return res.status(403).json({ message: 'No group access' });
      }

      const removed = await repository.remove({
        formId: req.params.id,
        groups
      });

      if (!removed) {
        return res.status(404).json({ message: 'Form not found' });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ message: 'Internal server error', detail: error.message });
  });

  return app;
}

module.exports = { createApp };
