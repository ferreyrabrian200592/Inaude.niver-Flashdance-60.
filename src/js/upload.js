import { isAlbumConfigured, MAX_FILE_SIZE, MAX_FILES, uploadAlbumFile } from './album.js';

const acceptedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm'
]);

const extensionTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm']
]);

const resolveSelectedType = (file) => {
  const declaredType = file.type?.toLowerCase().split(';')[0].trim();
  if (acceptedTypes.has(declaredType)) return declaredType;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return extensionTypes.get(extension) ?? '';
};

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const mountUpload = () => {
  const form = document.querySelector('[data-upload-form]');
  const status = document.querySelector('[data-upload-status]');
  const dropzone = document.querySelector('[data-upload-zone]');
  const fileInput = document.querySelector('[data-upload-input]');
  const pickerButton = document.querySelector('[data-upload-picker]');
  const fileList = document.querySelector('[data-upload-files]');
  const uploadLabel = document.querySelector('[data-upload-label]');
  const submitButton = document.querySelector('[data-upload-submit]');
  const successDialog = document.querySelector('[data-upload-success]');
  const successMessage = document.querySelector('[data-upload-success-message]');
  const successLink = document.querySelector('[data-upload-success-link]');

  if (
    !(form instanceof HTMLFormElement) ||
    !(status instanceof HTMLElement) ||
    !(dropzone instanceof HTMLElement) ||
    !(fileInput instanceof HTMLInputElement) ||
    !(pickerButton instanceof HTMLButtonElement) ||
    !(fileList instanceof HTMLElement) ||
    !(uploadLabel instanceof HTMLElement) ||
    !(submitButton instanceof HTMLButtonElement) ||
    !(successDialog instanceof HTMLDialogElement) ||
    !(successMessage instanceof HTMLElement) ||
    !(successLink instanceof HTMLAnchorElement)
  ) {
    return;
  }

  const authorInput = form.elements.namedItem('author');
  const consentInput = form.elements.namedItem('consent');
  if (!(authorInput instanceof HTMLInputElement) || !(consentInput instanceof HTMLInputElement)) return;

  const queue = [];
  let uploading = false;

  const updateSubmitButton = () => {
    submitButton.disabled = uploading || queue.length === 0 || !isAlbumConfigured;
  };

  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.dataset.state = kind;
  };

  const renderQueue = () => {
    uploadLabel.textContent = queue.length ? 'Adicionar mais fotos ou vídeos' : 'Escolher fotos e vídeos';
    fileList.replaceChildren();

    queue.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'upload-file';

      const selectedType = resolveSelectedType(item.file);
      if (item.previewUrl && selectedType.startsWith('image/')) {
        const preview = document.createElement('img');
        preview.className = 'upload-file__preview';
        preview.src = item.previewUrl;
        preview.alt = `Prévia de ${item.file.name}`;
        row.append(preview);
      } else {
        const preview = document.createElement('span');
        preview.className = 'upload-file__preview upload-file__preview--video';
        preview.setAttribute('aria-hidden', 'true');
        preview.textContent = '▶';
        row.append(preview);
      }

      const details = document.createElement('span');
      details.className = 'upload-file__details';
      const filename = document.createElement('strong');
      filename.textContent = item.file.name;
      const size = document.createElement('span');
      size.textContent = formatSize(item.file.size);
      details.append(filename, size);
      row.append(details);

      const progress = document.createElement('progress');
      progress.className = 'upload-file__progress';
      progress.max = 100;
      progress.value = item.progress;
      progress.setAttribute('aria-label', `Envio de ${item.file.name}`);
      row.append(progress);

      const remove = document.createElement('button');
      remove.className = 'upload-file__remove';
      remove.type = 'button';
      remove.textContent = 'Remover';
      remove.setAttribute('aria-label', `Remover ${item.file.name}`);
      remove.disabled = uploading;
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(item.previewUrl);
        queue.splice(queue.indexOf(item), 1);
        renderQueue();
        updateSubmitButton();
        if (!queue.length) {
          setStatus(
            isAlbumConfigured
              ? 'Escolha suas fotos ou vídeos para começar.'
              : 'Álbum ainda não conectado. Seus arquivos não serão enviados.',
            isAlbumConfigured ? '' : 'error'
          );
        }
      });
      row.append(remove);
      fileList.append(row);
    });

    updateSubmitButton();
  };

  const addFiles = (files) => {
    if (uploading) return;
    const invalid = [];
    const availableSlots = MAX_FILES - queue.length;
    const incoming = [...files];

    incoming.forEach((file) => {
      if (queue.length >= MAX_FILES) {
        invalid.push(`${file.name}: limite de ${MAX_FILES} arquivos por envio`);
        return;
      }
      if (!resolveSelectedType(file)) {
        invalid.push(`${file.name}: formato não aceito`);
        return;
      }
      if (!file.size) {
        invalid.push(`${file.name}: o arquivo está vazio`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        invalid.push(`${file.name}: ultrapassa 100 MB`);
        return;
      }
      if (queue.some((item) => item.file.name === file.name && item.file.size === file.size)) {
        invalid.push(`${file.name}: já foi selecionado`);
        return;
      }

      queue.push({
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0
      });
    });

    renderQueue();
    const validCount = Math.min(incoming.length - invalid.length, availableSlots);
    const acceptedMessage = validCount
      ? `${validCount} arquivo(s) adicionado(s). Confira a prévia antes de enviar.`
      : 'Escolha suas fotos ou vídeos para começar.';
    const configurationMessage = isAlbumConfigured
      ? ''
      : 'Álbum ainda não conectado. Estes arquivos não serão enviados.';
    const messages = [acceptedMessage, invalid.join(' · '), configurationMessage].filter(Boolean);
    setStatus(messages.join(' '), invalid.length || !isAlbumConfigured ? 'error' : '');
  };

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files ?? []);
    fileInput.value = '';
  });

  pickerButton.addEventListener('click', () => {
    if (!uploading) fileInput.click();
  });

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  }
  dropzone.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploading || !form.reportValidity()) return;
    if (!isAlbumConfigured) {
      setStatus('Álbum ainda não conectado. Nenhum arquivo foi enviado.', 'error');
      return;
    }
    if (!queue.length) {
      setStatus('Adicione pelo menos uma foto ou um vídeo antes de enviar.', 'error');
      return;
    }

    uploading = true;
    fileInput.disabled = true;
    pickerButton.disabled = true;
    dropzone.setAttribute('aria-disabled', 'true');
    updateSubmitButton();
    let completed = 0;
    let processed = 0;
    let lastUploadedName = '';
    const failures = [];
    const selected = [...queue];

    for (const item of selected) {
      setStatus(`Enviando ${processed + 1} de ${selected.length}: ${item.file.name}`);
      try {
        const uploadedItem = await uploadAlbumFile(item.file, authorInput.value.trim(), (progress) => {
          item.progress = progress;
          const bar = [...fileList.querySelectorAll('progress')][queue.indexOf(item)];
          if (bar) bar.value = progress;
        });
        lastUploadedName = uploadedItem.name;
        URL.revokeObjectURL(item.previewUrl);
        queue.splice(queue.indexOf(item), 1);
        completed += 1;
        renderQueue();
      } catch (error) {
        failures.push(`${item.file.name}: ${error instanceof Error ? error.message : 'falha ao enviar'}`);
      }
      processed += 1;
    }

    uploading = false;
    fileInput.disabled = false;
    pickerButton.disabled = false;
    dropzone.setAttribute('aria-disabled', 'false');
    updateSubmitButton();
    if (completed && !failures.length) {
      form.reset();
      renderQueue();
      const returnUrl = new URL('/#album', window.location.origin);
      returnUrl.searchParams.set('album-enviado', completed.toString());
      if (lastUploadedName) returnUrl.searchParams.set('album-item', lastUploadedName);
      successMessage.textContent =
        completed === 1
          ? 'Sua lembrança já faz parte do álbum coletivo. Muito obrigado por compartilhar!'
          : `${completed} lembranças já fazem parte do álbum coletivo. Muito obrigado por compartilhar!`;
      successLink.href = returnUrl.href;
      form.hidden = true;
      dropzone.hidden = true;
      const privacyNote = document.querySelector('.upload-privacy-note');
      if (privacyNote instanceof HTMLElement) privacyNote.hidden = true;
      successDialog.showModal();
      window.setTimeout(() => window.location.assign(returnUrl.href), 4500);
      return;
    }
    if (completed) {
      setStatus(`${completed} arquivo(s) enviado(s). Os demais continuam na lista: ${failures.join(' · ')}`, 'error');
      return;
    }
    setStatus(`Não foi possível enviar os arquivos. ${failures.join(' · ')}`, 'error');
  });

  if (isAlbumConfigured) {
    setStatus('Escolha suas fotos ou vídeos para começar.');
  } else {
    setStatus('Álbum ainda não conectado. Nenhum arquivo será enviado.', 'error');
  }
  updateSubmitButton();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountUpload, { once: true });
} else {
  mountUpload();
}
