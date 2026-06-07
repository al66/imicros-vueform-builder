const { randomUUID } = require('crypto');

class FormsRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id UUID PRIMARY KEY,
        group_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS form_versions (
        id BIGSERIAL PRIMARY KEY,
        form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        description TEXT NOT NULL,
        version_remark TEXT NOT NULL,
        form JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL,
        UNIQUE(form_id, version)
      );
    `);
  }

  async listByGroups(groups) {
    if (!groups.length) {
      return [];
    }

    const result = await this.pool.query(
      `
      SELECT f.id, f.group_id, fv.version, fv.description, fv.version_remark, fv.form
      FROM forms f
      JOIN LATERAL (
        SELECT version, description, version_remark, form
        FROM form_versions
        WHERE form_id = f.id
        ORDER BY version DESC
        LIMIT 1
      ) fv ON true
      WHERE f.group_id = ANY($1::text[])
      ORDER BY f.created_at DESC
      `,
      [groups]
    );

    return result.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      version: row.version,
      description: row.description,
      versionRemark: row.version_remark,
      form: row.form
    }));
  }

  async getByIdAndGroups(formId, groups) {
    const result = await this.pool.query(
      `
      SELECT f.id, f.group_id, fv.version, fv.description, fv.version_remark, fv.form
      FROM forms f
      JOIN LATERAL (
        SELECT version, description, version_remark, form
        FROM form_versions
        WHERE form_id = f.id
        ORDER BY version DESC
        LIMIT 1
      ) fv ON true
      WHERE f.id = $1 AND f.group_id = ANY($2::text[])
      `,
      [formId, groups]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      groupId: row.group_id,
      version: row.version,
      description: row.description,
      versionRemark: row.version_remark,
      form: row.form
    };
  }

  async create({ groupId, description, versionRemark, form, userId }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const id = randomUUID();
      await client.query(
        'INSERT INTO forms (id, group_id, created_by) VALUES ($1, $2, $3)',
        [id, groupId, userId]
      );
      await client.query(
        'INSERT INTO form_versions (form_id, version, description, version_remark, form, created_by) VALUES ($1, 1, $2, $3, $4::jsonb, $5)',
        [id, description, versionRemark, JSON.stringify(form), userId]
      );
      await client.query('COMMIT');
      return this.getByIdAndGroups(id, [groupId]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update({ formId, groups, description, versionRemark, form, userId }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const formRow = await client.query(
        'SELECT id, group_id FROM forms WHERE id = $1 AND group_id = ANY($2::text[]) FOR UPDATE',
        [formId, groups]
      );

      if (formRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const versionRow = await client.query(
        'SELECT COALESCE(MAX(version), 0) AS version FROM form_versions WHERE form_id = $1',
        [formId]
      );

      const nextVersion = Number(versionRow.rows[0].version) + 1;

      await client.query(
        'INSERT INTO form_versions (form_id, version, description, version_remark, form, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6)',
        [formId, nextVersion, description, versionRemark, JSON.stringify(form), userId]
      );

      await client.query('COMMIT');
      return this.getByIdAndGroups(formId, groups);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove({ formId, groups }) {
    const result = await this.pool.query(
      'DELETE FROM forms WHERE id = $1 AND group_id = ANY($2::text[]) RETURNING id',
      [formId, groups]
    );

    return result.rows.length > 0;
  }
}

module.exports = { FormsRepository };
