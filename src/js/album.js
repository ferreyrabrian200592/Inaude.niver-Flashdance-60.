const bucket = 'inaude-album';
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
  ['video/webm', 'webm']
]);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_FILES = 10;
const keyLooksConfigured =
  Boolean(supabaseKey) &&
  !['your_supabase_publishable_or_anon_key', 'your_supabase_key', 'replace-me'].includes(
    supabaseKey?.toLowerCase() ?? ''
  );
export const isAlbumConfigured = Boolean(supabaseUrl && keyLooksConfigured);

const headers = {
  apikey: supabaseKey ?? '',
  Authorization: 'Bearer ' + (supabaseKey ?? '')
};

const responseError = async (response) => {
  let details = '';
  try {
    const body = await response.json();
    details = body.message ?? body.error ?? body.msg ?? '';
  } catch {
    details = response.statusText;
  }

  return new Error(details || `O serviço do álbum respondeu com erro (${response.status}).`);
};

const makeAuthorSlug = (author) => {
  if (!author.trim()) return '';

  const slug = author
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug;
};

const formatAuthor = (slug) =>
  ['convidado', 'amigo-do-inaude'].includes(slug.toLowerCase())
    ? ''
    : slug.replace(/-/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

const getTypeFromName = (name) => {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const type = [...allowedTypes.entries()].find(([, allowedExtension]) => allowedExtension === extension)?.[0];
  return type ?? '';
};

const extensionTypeMap = new Map(
  [...allowedTypes].map(([type, extension]) => [extension, type])
);

const resolveFileType = (file) => {
  const declaredType = file.type?.toLowerCase().split(';')[0].trim();
  if (allowedTypes.has(declaredType)) return declaredType;

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return extensionTypeMap.get(extension) ?? '';
};

const getPublicUrl = (name) =>
  `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURIComponent(name)}`;

export const listAlbumItems = async (limit = 200) => {
  if (!isAlbumConfigured) {
    throw new Error('O álbum compartilhado ainda não está configurado. Nenhuma foto de exemplo será exibida.');
  }

  const maxItems = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : Infinity;
  const newestFirst = maxItems !== Infinity;
  const pageSize = 100;
  const objects = [];
  let offset = 0;

  while (objects.length < maxItems) {
    const requestLimit = Math.min(pageSize, maxItems - objects.length);
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: '',
        limit: requestLimit,
        offset,
        sortBy: { column: 'created_at', order: newestFirst ? 'desc' : 'asc' }
      })
    });

    if (!response.ok) throw await responseError(response);

    const page = await response.json();
    objects.push(...page);
    offset += page.length;
    if (page.length < requestLimit) break;
  }

  return objects
    .filter((object) => object.name && object.name !== '.emptyFolderPlaceholder')
    .map((object) => {
      const name = object.name;
      const match = name.match(/^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.+)\.([a-z0-9]+)$/i);
      const type = getTypeFromName(name);
      if (!type) return null;

      return {
        name,
        author: match?.[1] ? formatAuthor(match[1]) : '',
        type: type.startsWith('video/') ? 'video' : 'photo',
        url: getPublicUrl(name),
        createdAt: object.created_at ?? ''
      };
    })
    .filter(Boolean)
    .sort((first, second) => {
      const createdAtOrder = Date.parse(first.createdAt) - Date.parse(second.createdAt);
      if (Number.isFinite(createdAtOrder) && createdAtOrder !== 0) return createdAtOrder * -1;

      const firstUploadTime = Number(first.name.match(/^(\d+)-/)?.[1] ?? 0);
      const secondUploadTime = Number(second.name.match(/^(\d+)-/)?.[1] ?? 0);
      return secondUploadTime - firstUploadTime || second.name.localeCompare(first.name);
    });
};

export const uploadAlbumFile = (file, author, onProgress) => {
  if (!isAlbumConfigured) {
    return Promise.reject(new Error('O álbum compartilhado ainda não está configurado.'));
  }

  const resolvedType = resolveFileType(file);
  const extension = allowedTypes.get(resolvedType);
  if (!extension) return Promise.reject(new Error('Este formato de arquivo não é aceito.'));
  if (!file.size) return Promise.reject(new Error('O arquivo está vazio.'));
  if (file.size > MAX_FILE_SIZE) return Promise.reject(new Error('O arquivo ultrapassa o limite de 100 MB.'));

  const authorSlug = makeAuthorSlug(author);
  const name = `${Date.now()}-${crypto.randomUUID()}${authorSlug ? `-${authorSlug}` : ''}.${extension}`;
  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(name)}`;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', endpoint);
    request.setRequestHeader('apikey', supabaseKey);
    request.setRequestHeader('Authorization', 'Bearer ' + supabaseKey);
    request.setRequestHeader('Content-Type', resolvedType);
    request.timeout = 10 * 60 * 1000;
    request.addEventListener('timeout', () => reject(new Error('O envio demorou demais. Verifique sua conexão e tente novamente.')));
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      if (request.status < 200 || request.status >= 300) {
        let detail = '';
        try {
          const body = JSON.parse(request.responseText);
          detail = body.message ?? body.error ?? body.msg ?? '';
        } catch {
          detail = request.statusText;
        }
        reject(new Error(detail || `Não foi possível enviar o arquivo (${request.status}).`));
        return;
      }

      resolve({
        name,
        author: authorSlug ? formatAuthor(authorSlug) : '',
        type: resolvedType.startsWith('video/') ? 'video' : 'photo',
        url: getPublicUrl(name),
        createdAt: new Date().toISOString()
      });
    });
    request.addEventListener('error', () => reject(new Error('Falha de conexão durante o envio.')));
    request.addEventListener('abort', () => reject(new Error('O envio foi cancelado.')));
    request.send(file);
  });
};
