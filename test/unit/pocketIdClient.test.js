const { createPocketIdAuth } = require('../../src/pocketIdClient');

function createResponseMock() {
  const headers = new Map();
  return {
    statusCode: 200,
    headers,
    body: undefined,
    location: undefined,
    getHeader: (name) => headers.get(name),
    setHeader: (name, value) => headers.set(name, value),
    redirect(url) {
      this.statusCode = 302;
      this.location = url;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('pocket id oidc auth client', () => {
  const config = {
    pocketIdIssuerUrl: 'https://issuer.example.com',
    pocketIdClientId: 'client-id',
    pocketIdClientSecret: 'client-secret',
    pocketIdCallbackUrl: 'https://app.example.com/auth/callback',
    pocketIdApiUrl: 'https://issuer.example.com'
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('redirects to authorization endpoint from login', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_endpoint: 'https://issuer.example.com/oauth/authorize',
        token_endpoint: 'https://issuer.example.com/oauth/token'
      })
    });

    const auth = createPocketIdAuth(config);
    const req = { headers: { cookie: '' }, method: 'GET', secure: true };
    const res = createResponseMock();

    await auth.login(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.location).toContain('https://issuer.example.com/oauth/authorize');
    expect(res.location).toContain('response_type=code');
    const setCookie = res.getHeader('Set-Cookie');
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie?.[0]).toContain('vf_oidc_state=');
  });

  test('creates a session from callback and authorizes requests', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'https://issuer.example.com/oauth/authorize',
          token_endpoint: 'https://issuer.example.com/oauth/token'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-abc' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: 'user-1', email: 'user@example.com', groups: ['group-1'] })
      });

    const auth = createPocketIdAuth(config);
    const loginReq = { headers: { cookie: '' }, method: 'GET', secure: true };
    const loginRes = createResponseMock();
    await auth.login(loginReq, loginRes);

    const loginCookies = loginRes.getHeader('Set-Cookie');
    expect(Array.isArray(loginCookies)).toBe(true);
    const stateCookie = loginCookies?.[0];
    expect(stateCookie).toContain('vf_oidc_state=');
    const stateValue = stateCookie.split(';')[0].split('=')[1];

    const callbackReq = {
      headers: { cookie: `vf_oidc_state=${stateValue}` },
      query: { code: 'auth-code', state: stateValue },
      method: 'GET',
      secure: true
    };
    const callbackRes = createResponseMock();
    await auth.callback(callbackReq, callbackRes);

    expect(callbackRes.statusCode).toBe(302);
    expect(callbackRes.location).toBe('/');

    const sessionCookie = callbackRes.getHeader('Set-Cookie').find((entry) => entry.startsWith('vf_session_id='));
    const sessionCookieValue = sessionCookie.split(';')[0];

    const req = { headers: { cookie: sessionCookieValue }, method: 'GET' };
    const res = createResponseMock();
    const next = jest.fn();
    auth.requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.userId).toBe('user-1');
    expect(req.user.groups).toEqual(['group-1']);
  });

  test('redirects unauthenticated GET requests', () => {
    const auth = createPocketIdAuth(config);
    const req = { headers: { cookie: '' }, method: 'GET' };
    const res = createResponseMock();
    const next = jest.fn();

    auth.requireAuth(req, res, next);

    expect(res.statusCode).toBe(302);
    expect(res.location).toBe('/auth/login');
    expect(next).not.toHaveBeenCalled();
  });
});
