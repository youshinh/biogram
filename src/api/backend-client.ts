let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

function readCookie(name: string): string {
  const key = `${name}=`;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const raw of cookies) {
    const c = raw.trim();
    if (c.startsWith(key)) {
      return decodeURIComponent(c.slice(key.length));
    }
  }
  return '';
}

async function bootstrapSession(force = false): Promise<void> {
  if (bootstrapped && !force) return;
  if (bootstrapPromise && !force) return bootstrapPromise;

  bootstrapPromise = fetch('/api/session/bootstrap', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    },
    body: '{}'
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Session bootstrap failed (${res.status})`);
    }
    bootstrapped = true;
  }).finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}

export async function postBackendJson<T>(path: string, payload: unknown, allowRetry = true): Promise<T> {
  await bootstrapSession();
  const csrf = readCookie('bg_csrf');

  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf
    },
    body: JSON.stringify(payload ?? {})
  });

  if (response.status === 403 && allowRetry) {
    bootstrapped = false;
    await bootstrapSession(true);
    return postBackendJson<T>(path, payload, false);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const e = await response.json();
      detail = e?.error || '';
    } catch {
      // ignore
    }
    throw new Error(`${path} failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  return response.json() as Promise<T>;
}
