async function fetchUserContext({ baseUrl, token, apiToken }) {
  const headers = {
    Authorization: 'Bearer ' + token
  };

  if (apiToken) {
    headers['X-API-Key'] = apiToken;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/user`, {
    headers
  });

  if (!response.ok) {
    throw new Error(`Pocket ID API returned ${response.status}`);
  }

  const payload = await response.json();

  return {
    userId: payload.id,
    email: payload.email,
    groups: Array.isArray(payload.groups) ? payload.groups : []
  };
}

module.exports = { fetchUserContext };
