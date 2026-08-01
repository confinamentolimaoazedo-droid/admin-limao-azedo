const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function encode(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decode(input) {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );

  let binary = '';
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createToken(user, secret) {
  const payload = encode(JSON.stringify({
    sub: user,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60
  }));

  return `${payload}.${await sign(payload, secret)}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  if (signature !== await sign(payload, secret)) return null;

  try {
    const data = JSON.parse(decode(payload));

    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  const max = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let i = 0; i < max; i++) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }

  return difference === 0;
}

async function login(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({ sucesso: false, mensagem: 'Requisição inválida.' }, 400);
  }

  if (
    !safeEqual(body.usuario || '', env.ADMIN_USER || '') ||
    !safeEqual(body.senha || '', env.ADMIN_PASSWORD || '')
  ) {
    return json({ sucesso: false, mensagem: 'Usuário ou senha incorretos.' }, 401);
  }

  return json({
    sucesso: true,
    usuario: body.usuario,
    token: await createToken(body.usuario, env.ADMIN_TOKEN_SECRET)
  });
}

async function admin(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  const session = await verifyToken(token, env.ADMIN_TOKEN_SECRET);

  if (!session) {
    return json({ sucesso: false, mensagem: 'Sessão expirada.' }, 401);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ sucesso: false, mensagem: 'Requisição inválida.' }, 400);
  }

  if (body.acao === 'validarSessao') {
    return json({ sucesso: true, usuario: session.sub });
  }

  if (!env.APPS_SCRIPT_URL || !env.API_SECRET) {
    return json({
      sucesso: false,
      mensagem: 'Integração com a planilha não configurada.'
    }, 503);
  }

  const upstream = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      ...body,
      segredo: env.API_SECRET,
      modo: 'admin',
      administrador: session.sub
    })
  });

  const text = await upstream.text();

  try {
    const data = JSON.parse(text);
    return json(data, data.sucesso === false ? 400 : 200);
  } catch {
    console.error('Resposta inválida do Apps Script:', text);

    return json({
      sucesso: false,
      mensagem: 'A planilha retornou uma resposta inválida.'
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/login') {
      return request.method === 'POST'
        ? login(request, env)
        : json({ sucesso: false, mensagem: 'Método não permitido.' }, 405);
    }

    if (url.pathname === '/api/admin') {
      return request.method === 'POST'
        ? admin(request, env)
        : json({ sucesso: false, mensagem: 'Método não permitido.' }, 405);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);

    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );

    if (
      url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')
    ) {
      headers.set('Cache-Control', 'no-cache');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
