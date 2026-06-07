const crypto = require('crypto');

const SESSION_COOKIE = 'vf_session_id';
const OIDC_STATE_COOKIE = 'vf_oidc_state';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const STATE_TTL_MS = 5 * 60 * 1000;

function parseCookies(cookieHeader = '') {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const cookieParts = [`${name}=${encodeURIComponent(value)}`];
  cookieParts.push(`Path=${options.path || '/'}`);

  if (options.httpOnly !== false) cookieParts.push('HttpOnly');
  if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
  if (options.secure) cookieParts.push('Secure');
  if (Number.isFinite(options.maxAge)) cookieParts.push(`Max-Age=${Math.floor(options.maxAge)}`);

  return cookieParts.join('; ');
}

function appendCookies(res, cookies) {
  const existing = res.getHeader('Set-Cookie');
  const current = Array.isArray(existing) ? existing : existing ? [existing] : [];
  res.setHeader('Set-Cookie', [...current, ...cookies]);
}

function isSecureRequest(req) {
  if (req.secure) return true;
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

class SessionStore {
  constructor(ttlMs = SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this.operationCount = 0;
  }

  cleanupExpired(now = Date.now()) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  maybeCleanup(now) {
    this.operationCount += 1;
    if (this.operationCount % 100 === 0) {
      this.cleanupExpired(now);
    }
  }

  set(user) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.maybeCleanup(now);
    this.sessions.set(sessionId, {
      user,
      createdAt: now,
      expiresAt: now + this.ttlMs
    });
    return sessionId;
  }

  get(sessionId) {
    if (!sessionId) return null;
    const now = Date.now();
    this.maybeCleanup(now);
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  delete(sessionId) {
    if (!sessionId) return;
    this.sessions.delete(sessionId);
  }
}

class OidcClient {
  constructor({ issuerUrl, clientId, clientSecret, callbackUrl, apiUrl }) {
    this.issuerUrl = issuerUrl.replace(/\/$/, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.discovery = null;
  }

  async getDiscovery() {
    if (this.discovery) return this.discovery;
    const response = await fetch(`${this.issuerUrl}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed (${response.status})`);
    }
    this.discovery = await response.json();
    if (!this.discovery.authorization_endpoint || !this.discovery.token_endpoint) {
      throw new Error('OIDC discovery is missing required endpoints');
    }
    return this.discovery;
  }

  async buildAuthorizationUrl(state) {
    const discovery = await this.getDiscovery();
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'openid profile email groups',
      state
    });

    return `${discovery.authorization_endpoint}?${query.toString()}`;
  }

  async exchangeCodeForTokens(code) {
    const discovery = await this.getDiscovery();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      throw new Error(`OIDC token exchange failed (${response.status})`);
    }

    return response.json();
  }

  async fetchUserInfo(accessToken) {
    const response = await fetch(`${this.apiUrl}/api/oidc/userinfo`, {
      headers: {
        Authorization: ['Bearer', accessToken].join(' ')
      }
    });

    if (!response.ok) {
      throw new Error(`OIDC userinfo request failed (${response.status})`);
    }

    const claims = await response.json();
    const userId = claims.sub || claims.id;
    if (!userId) {
      throw new Error('OIDC userinfo payload does not include a subject');
    }

    return {
      userId,
      email: claims.email || null,
      name: claims.name || null,
      groups: Array.isArray(claims.groups) ? claims.groups : [],
      claims
    };
  }
}

function createPocketIdAuth(config) {
  const oidc = new OidcClient({
    issuerUrl: config.pocketIdIssuerUrl,
    clientId: config.pocketIdClientId,
    clientSecret: config.pocketIdClientSecret,
    callbackUrl: config.pocketIdCallbackUrl,
    apiUrl: config.pocketIdApiUrl
  });
  const sessions = new SessionStore();

  function getCookieOptions(req) {
    return {
      secure: isSecureRequest(req),
      sameSite: 'Lax',
      path: '/',
      httpOnly: true
    };
  }

  function getSessionUser(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const session = sessions.get(cookies[SESSION_COOKIE]);
    return session ? session.user : null;
  }

  async function login(req, res) {
    const state = crypto.randomBytes(24).toString('hex');
    const authorizationUrl = await oidc.buildAuthorizationUrl(state);
    appendCookies(res, [
      serializeCookie(OIDC_STATE_COOKIE, state, {
        ...getCookieOptions(req),
        maxAge: Math.floor(STATE_TTL_MS / 1000)
      })
    ]);
    res.redirect(authorizationUrl);
  }

  async function callback(req, res) {
    const authError = req.query.error;
    if (authError) {
      return res.status(401).json({ message: 'Authentication failed' });
    }

    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
      return res.status(400).json({ message: 'Missing OIDC callback parameters' });
    }

    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies[OIDC_STATE_COOKIE] !== state) {
      return res.status(401).json({ message: 'Invalid OIDC state' });
    }

    const tokens = await oidc.exchangeCodeForTokens(code);
    if (!tokens.access_token) {
      return res.status(401).json({ message: 'Token exchange did not return an access token' });
    }

    const user = await oidc.fetchUserInfo(tokens.access_token);
    const sessionId = sessions.set(user);

    appendCookies(res, [
      serializeCookie(OIDC_STATE_COOKIE, '', { ...getCookieOptions(req), maxAge: 0 }),
      serializeCookie(SESSION_COOKIE, sessionId, {
        ...getCookieOptions(req),
        maxAge: Math.floor(SESSION_TTL_MS / 1000)
      })
    ]);

    return res.redirect('/');
  }

  async function logout(req, res) {
    const cookies = parseCookies(req.headers.cookie || '');
    sessions.delete(cookies[SESSION_COOKIE]);

    appendCookies(res, [
      serializeCookie(SESSION_COOKIE, '', { ...getCookieOptions(req), maxAge: 0 }),
      serializeCookie(OIDC_STATE_COOKIE, '', { ...getCookieOptions(req), maxAge: 0 })
    ]);
    res.status(204).send();
  }

  function requireAuth(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
      if (req.method === 'GET') {
        return res.redirect('/auth/login');
      }
      return res.status(401).json({ message: 'Authentication required' });
    }
    req.user = user;
    return next();
  }

  return {
    login,
    callback,
    logout,
    requireAuth
  };
}

module.exports = { createPocketIdAuth };
