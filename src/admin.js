import './styles/variables.css';
import './styles/base.css';
import './styles/admin.css';

const projectUrl = 'https://otqhrpbxhxkrhrnjqbba.supabase.co';
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const bucket = 'inaude-album';
const sessionKey = 'inaude-admin-session';
const loginForm = document.querySelector('[data-admin-login]');
const passwordForm = document.querySelector('[data-admin-password]');
const dashboard = document.querySelector('[data-admin-dashboard]');
const feedback = document.querySelector('[data-admin-feedback]');
const status = document.querySelector('[data-admin-status]');
const grid = document.querySelector('[data-admin-grid]');
const account = document.querySelector('[data-admin-account]');
const logoutButton = document.querySelector('[data-admin-logout]');

const formatError = async (response) => {
  let details = '';
  try {
    const body = await response.json();
    details = body.msg ?? body.message ?? body.error_description ?? body.error ?? '';
  } catch {
    details = response.statusText;
  }
  return new Error(details || `O Supabase respondeu com erro (${response.status}).`);
};

const request = async (path, options = {}, accessToken = '') => {
  const response = await fetch(`${projectUrl}${path}`, {
    ...options,
    headers: {
      apikey: publicKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    }
  });
  if (!response.ok) throw await formatError(response);
  if (response.status === 204) return null;
  return response.json();
};

const readSession = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null');
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') return null;
    return session;
  } catch {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
};

const saveSession = (session) => {
  const expiresAt =
    session.expires_at ??
    (session.expires_in ? Math.floor(Date.now() / 1000) + session.expires_in : undefined);
  sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, expires_at: expiresAt }));
};

const takeAuthRedirectSession = () => {
  if (!window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const type = params.get('type');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!['invite', 'recovery', 'signup'].includes(type) || !accessToken || !refreshToken) return null;

  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number(params.get('expires_in')) || 3600,
    token_type: params.get('token_type') || 'bearer'
  };
  saveSession(session);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return session;
};

const refreshSession = async (session) => {
  const renewed = await request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  saveSession(renewed);
  return renewed;
};

const getValidSession = async () => {
  let session = readSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    session = await refreshSession(session);
  }
  return session;
};

const listAlbumFiles = async (accessToken) => {
  const files = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: '',
        limit: pageSize,
        offset,
        sortBy: { column: 'created_at', order: 'desc' }
      })
    }, accessToken);
    files.push(...page.filter((file) => file.name && file.name !== '.emptyFolderPlaceholder'));
    if (page.length < pageSize) return files;
  }
};

const getFileDetails = (file) => {
  const name = file.name;
  const authorSlug = name.match(/^\d+-[0-9a-f-]{36}-(.+)\.[a-z0-9]+$/i)?.[1] ?? '';
  const author = authorSlug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const isVideo = ['mp4', 'mov', 'webm'].includes(extension);
  return {
    name,
    author,
    isVideo,
    url: `${projectUrl}/storage/v1/object/public/${bucket}/${encodeURIComponent(name)}`,
    createdAt: file.created_at,
    size: Number(file.metadata?.size) || 0
  };
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[unit]}`;
};

const showError = (error, fallback) => {
  feedback.textContent = `${fallback} ${error instanceof Error ? error.message : 'Tente novamente.'}`;
  feedback.dataset.state = 'error';
};

const renderFiles = (files, session) => {
  grid.replaceChildren();
  files.forEach((file) => {
    const item = getFileDetails(file);
    const card = document.createElement('article');
    card.className = 'admin-card';

    const media = item.isVideo ? document.createElement('video') : document.createElement('img');
    media.className = 'admin-card__media';
    media.src = item.url;
    if (item.isVideo) {
      media.controls = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.setAttribute('aria-label', item.author ? `Vídeo enviado por ${item.author}` : 'Vídeo compartilhado');
    } else {
      media.alt = item.author ? `Foto enviada por ${item.author}` : 'Foto compartilhada';
      media.loading = 'lazy';
    }
    card.append(media);

    const details = document.createElement('div');
    details.className = 'admin-card__details';
    const title = document.createElement('h3');
    title.textContent = item.author || (item.isVideo ? 'Vídeo sem nome' : 'Foto sem nome');
    const date = document.createElement('p');
    date.textContent = formatDate(item.createdAt);
    const size = document.createElement('p');
    size.textContent = `${item.isVideo ? 'Vídeo' : 'Foto'}${item.size ? ` · ${formatSize(item.size)}` : ''}`;
    details.append(title, date, size);

    const actions = document.createElement('div');
    actions.className = 'admin-card__actions';

    const download = document.createElement('button');
    download.className = 'admin-card__download';
    download.type = 'button';
    download.textContent = 'Baixar arquivo';
    download.setAttribute('aria-label', `Baixar arquivo de ${item.author || 'esta lembrança'}`);
    download.addEventListener('click', async () => {
      download.disabled = true;
      feedback.textContent = `Preparando o download de ${item.author || 'esta lembrança'}…`;
      feedback.dataset.state = '';
      try {
        const response = await fetch(item.url);
        if (!response.ok) throw await formatError(response);
        const fileUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = item.name;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
        feedback.textContent = 'Download iniciado.';
        feedback.dataset.state = 'success';
      } catch (error) {
        showError(error, 'Não foi possível baixar este arquivo.');
      } finally {
        download.disabled = false;
      }
    });

    const remove = document.createElement('button');
    remove.className = 'admin-card__remove';
    remove.type = 'button';
    remove.textContent = 'Remover do álbum';
    remove.setAttribute('aria-label', `Remover ${item.author || 'esta lembrança'} do álbum`);
    remove.addEventListener('click', async () => {
      const label = item.author || 'esta lembrança';
      if (!window.confirm(`Remover ${label} do álbum? Esta ação apaga o arquivo permanentemente.`)) return;

      remove.disabled = true;
      feedback.textContent = `Removendo ${label}…`;
      feedback.dataset.state = '';
      try {
        await request(`/storage/v1/object/${bucket}/${encodeURIComponent(item.name)}`, {
          method: 'DELETE'
        }, session.access_token);
        card.remove();
        const remaining = grid.querySelectorAll('.admin-card').length;
        status.textContent = remaining
          ? `${remaining} lembrança(s) no álbum.`
          : 'O álbum está esperando pelas primeiras fotos e vídeos da festa.';
        feedback.textContent = 'A lembrança foi removida do álbum.';
        feedback.dataset.state = 'success';
      } catch (error) {
        remove.disabled = false;
        showError(error, 'Não foi possível remover esta lembrança.');
      }
    });
    actions.append(download, remove);
    details.append(actions);
    card.append(details);
    grid.append(card);
  });

  status.textContent = files.length
    ? `${files.length} lembrança(s) no álbum. As mais recentes aparecem primeiro.`
    : 'O álbum está esperando pelas primeiras fotos e vídeos da festa.';
};

const showDashboard = async (session) => {
  loginForm.hidden = true;
  dashboard.hidden = true;
  feedback.textContent = '';
  feedback.dataset.state = '';
  try {
    feedback.textContent = 'Verificando acesso de administradora…';
    const isAdmin = await request('/rest/v1/rpc/is_album_admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }, session.access_token);
    if (isAdmin !== true) {
      sessionStorage.removeItem(sessionKey);
      loginForm.hidden = false;
      showError(new Error('Esta conta não está autorizada para moderar o álbum.'), 'Acesso não autorizado.');
      return;
    }

    dashboard.hidden = false;
    account.textContent = session.user?.email ?? 'Conta administradora';
    status.textContent = 'Carregando as lembranças…';
    feedback.textContent = '';
    const files = await listAlbumFiles(session.access_token);
    renderFiles(files, session);
  } catch (error) {
    if (error instanceof Error && /JWT|token|unauthorized|expired/i.test(error.message)) {
      sessionStorage.removeItem(sessionKey);
      dashboard.hidden = true;
      loginForm.hidden = false;
      showError(error, 'Sua sessão expirou. Entre novamente.');
      return;
    }
    if (dashboard.hidden) loginForm.hidden = false;
    else status.textContent = '';
    showError(error, 'Não foi possível carregar o álbum.');
  }
};

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const session = readSession();
  if (!session) {
    passwordForm.hidden = true;
    loginForm.hidden = false;
    showError(new Error('O link de configuração expirou ou já foi utilizado.'), 'Solicite uma nova mensagem de convite.');
    return;
  }

  const formData = new FormData(passwordForm);
  const password = formData.get('password');
  const confirmation = formData.get('password-confirmation');
  if (password !== confirmation) {
    showError(new Error('As senhas informadas são diferentes.'), 'Confira a confirmação da senha.');
    return;
  }

  const submit = passwordForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  feedback.textContent = 'Salvando sua senha…';
  feedback.dataset.state = '';
  try {
    session.user = await request('/auth/v1/user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }, session.access_token);
    saveSession(session);
    passwordForm.reset();
    passwordForm.hidden = true;
    await showDashboard(session);
  } catch (error) {
    showError(error, 'Não foi possível salvar a senha.');
  } finally {
    submit.disabled = false;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector('button[type="submit"]');
  const formData = new FormData(loginForm);
  submit.disabled = true;
  feedback.textContent = 'Verificando acesso…';
  feedback.dataset.state = '';
  try {
    const session = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password')
      })
    });
    saveSession(session);
    loginForm.reset();
    await showDashboard(session);
  } catch (error) {
    showError(error, 'Não foi possível entrar. Confira o e-mail e a senha.');
  } finally {
    submit.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  const session = readSession();
  sessionStorage.removeItem(sessionKey);
  dashboard.hidden = true;
  grid.replaceChildren();
  loginForm.hidden = false;
  feedback.textContent = 'Sessão encerrada.';
  feedback.dataset.state = '';
  if (session?.access_token) {
    try {
      await request('/auth/v1/logout', { method: 'POST' }, session.access_token);
    } catch (error) {
      showError(error, 'A sessão foi encerrada neste dispositivo, mas o token não pôde ser invalidado.');
    }
  }
});

if (!projectUrl || !publicKey) {
  loginForm.hidden = true;
  showError(new Error('O acesso ao álbum não está configurado.'), 'Painel indisponível.');
} else {
  const redirectedSession = takeAuthRedirectSession();
  if (redirectedSession) {
    loginForm.hidden = true;
    passwordForm.hidden = false;
    feedback.textContent = 'Convite confirmado. Crie a senha que só você usará para acessar este painel.';
  } else {
    const session = readSession();
    if (session) {
      getValidSession()
        .then((validSession) => validSession && showDashboard(validSession))
        .catch((error) => {
          sessionStorage.removeItem(sessionKey);
          showError(error, 'Sua sessão expirou. Entre novamente.');
        });
    }
  }
}
