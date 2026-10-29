// Runtime validation coverage for: guest photo upload and Netlify configuration.
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readProjectFile = (fileName) =>
  readFile(new URL(`../${fileName}`, import.meta.url), 'utf8');

describe('guest photo upload', () => {
  it('uses the honoree name Inaude Jr. consistently across public and private pages', async () => {
    const pages = await Promise.all(
      ['index.html', 'upload.html', 'galeria.html', 'admin.html'].map(readProjectFile)
    );
    const styles = await readProjectFile('src/styles/base.css');

    expect(pages[0]).toContain('<title>Parabéns, Inaude Jr. — Colorado desde 1966</title>');
    expect(pages[0]).not.toContain('Com carinho, para Inaude Jr.');
    expect(pages[0]).toContain('<span class="wordmark__name">Inaude j<span class="wordmark__suffix">r</span>.</span>');
    expect(pages[0]).not.toContain('<span>Inaude</span>');
    pages.forEach((html) =>
      expect(html).toContain('<span class="wordmark__name">Inaude j<span class="wordmark__suffix">r</span>.</span>')
    );
    pages.slice(1).forEach((html) => expect(html).toContain('Inaude Jr.'));
    pages.forEach((html) => expect(html).not.toMatch(/Parabéns, Inaude(?:\s*[—<])/));
    expect(styles).toContain('font-family: var(--font-display)');
    expect(styles).toMatch(/\.wordmark__suffix\s*\{\s*font-family:\s*var\(--font-body\);\s*\}/);
    expect(styles).toContain('letter-spacing: 0.015em');
    expect(styles).toContain('text-transform: none');
    expect(styles).toContain('font-size: 0.68rem');
  });

  it('lets guests choose multiple images without forcing camera capture', async () => {
    const html = await readProjectFile('upload.html');
    const input = html.match(/<input\s+class="upload-file-input"[\s\S]*?\/>/)?.[0];

    expect(input).toBeDefined();
    expect(input).toContain('accept="image/*,video/mp4,video/quicktime,video/webm"');
    expect(input).toMatch(/\bmultiple\b/);
    expect(input).not.toMatch(/\bcapture\b/);
    expect(html).toMatch(/<div[^>]*data-upload-zone[^>]*>[\s\S]*?<button[^>]*data-upload-picker[^>]*type="button"[\s\S]*?<\/button>[\s\S]*?<input[^>]*data-upload-input[\s\S]*?<\/div>/);
    expect(await readProjectFile('src/js/upload.js')).toContain('if (!uploading) fileInput.click()');
  });

  it('requires sharing consent before submission', async () => {
    const html = await readProjectFile('upload.html');

    expect(html).toMatch(/<input name="consent" type="checkbox" required \/>/);
    expect(html).toMatch(/<button[^>]*data-upload-submit[^>]*disabled>/);
  });

  it('shows an accessible thank-you modal before returning to the album', async () => {
    const html = await readProjectFile('upload.html');
    const script = await readProjectFile('src/js/upload.js');
    const styles = await readProjectFile('src/styles/upload.css');

    expect(html).toMatch(/<dialog[^>]*data-upload-success[^>]*>/);
    expect(html).toContain('data-upload-success-link');
    expect(styles).toMatch(/\.upload-success:not\(\[open\]\)\s*\{\s*display:\s*none;/);
    expect(script).toContain('successDialog.showModal()');
    expect(script).toContain('window.setTimeout(() => window.location.assign(returnUrl.href), 4500)');
    expect(script).toContain("returnUrl.searchParams.set('album-item', lastUploadedName)");
  });
});

describe('live infinite album carousel', () => {
  it('refreshes new uploads and opens the latest uploaded image on return', async () => {
    const script = await readProjectFile('src/js/carrusel.js');

    expect(script).toContain("get('album-item')");
    expect(script).toContain('const refreshAlbum = async () =>');
    expect(script).toContain("document.addEventListener('visibilitychange'");
    expect(script).toContain('window.setInterval(() =>');
    expect(script).toContain('track.replaceChildren(');
  });

  it('animates incoming photos without changing their image files', async () => {
    const script = await readProjectFile('src/js/carrusel.js');
    const styles = await readProjectFile('src/styles/carrusel.css');

    expect(script).toContain("activeSlide.classList.add('is-arriving')");
    expect(styles).toContain('.slide.is-arriving[data-transition="focus"]');
    expect(styles).toContain('.slide.is-arriving[data-transition="silver"]');
    expect(styles).toContain('.slide.is-arriving[data-transition="warm"]');
  });

  it('opens uploaded album videos in an accessible cinematic player', async () => {
    const html = await readProjectFile('index.html');
    const script = await readProjectFile('src/js/carrusel.js');
    const styles = await readProjectFile('src/styles/carrusel.css');

    expect(html).toMatch(/data-carousel[\s\S]*data-cinema-player/);
    expect(html).toContain('data-cinema-player');
    expect(html).toContain('MEMÓRIA DO ÁLBUM');
    expect(html).toContain('data-cinema-seek');
    expect(html).toContain('data-cinema-mute');
    expect(script).toContain("carousel.classList.add('is-cinema-open')");
    expect(script).toContain("carousel.classList.remove('is-cinema-open')");
    expect(script).toContain("carouselShell?.classList.add('is-cinema-open')");
    expect(script).toContain("track.setAttribute('aria-hidden', 'true')");
    expect(script).toContain('track.inert = true');
    expect(script).toContain('video, [data-cinema-player]');
    expect(script).toContain('cinemaVideo.src = video.currentSrc || video.src');
    expect(script).toContain('cinemaPlayer.hidden = false');
    expect(script).toContain('cinemaPlayer.hidden = true');
    expect(script).toContain("event.code === 'Space'");
    expect(script).toContain('document.hidden || activeVideo');
    expect(styles).toContain('.cinema-player[hidden]');
    expect(styles).toContain('.carousel.is-cinema-open .carousel__track');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(`${html}${script}`).not.toMatch(/EN VIVO|AO VIVO/i);
    expect(styles).toContain('.cinema-player__stage');
  });

  it('resumes the carousel in place and shows a newly uploaded batch before looping', async () => {
    const script = await readProjectFile('src/js/carrusel.js');
    const closeCinema = script.slice(
      script.indexOf('const closeCinema = () =>'),
      script.indexOf("cinemaPlayer?.addEventListener('click'")
    );

    expect(script).toContain('Math.max(0, uploadedItemIndex - uploadedCount + 1)');
    expect(script).toContain('centerSlide(firstUploadedItemIndex >= 0 ? firstUploadedItemIndex : 0)');
    expect(script).toContain('centerSlide(currentKeyIndex >= 0 ? currentKeyIndex : 0)');
    expect(closeCinema).toContain('paused = reducedMotion.matches || originalSlides.length < 2');
    expect(closeCinema).toContain('render()');
    expect(closeCinema).not.toContain('pauseTemporarily()');
    expect(closeCinema).not.toContain('centerSlide(');
  });

  it('keeps the infinite carousel lightweight by cloning only its edge slides', async () => {
    const script = await readProjectFile('src/js/carrusel.js');

    expect(script).toContain('const replaceSlides = (slides) =>');
    expect(script).toContain('const leadingClone = cloneSlide(slides[slides.length - 1])');
    expect(script).toContain('const trailingClone = cloneSlide(slides[0])');
    expect(script).toContain('track.replaceChildren(leadingClone, ...slides, trailingClone)');
    expect(script).not.toContain('originals.map(cloneSlide)');
    expect(script).not.toContain('refreshedOriginals.map(cloneSlide)');
  });

  it('puts photos first with wider slides, compact side controls, and a lighter caption', async () => {
    const styles = await readProjectFile('src/styles/carrusel.css');

    expect(styles).toContain('flex: 0 0 min(76vw, 1080px)');
    expect(styles).toContain('flex-basis: min(94vw, 680px)');
    expect(styles).toContain('inset: 50% 1rem auto');
    expect(styles).toContain('width: 2.5rem;');
    expect(styles).toContain('bottom: clamp(2rem, 7vh, 4rem)');
    expect(styles).toContain('background: linear-gradient(110deg, rgb(9 12 19 / 72%), rgb(18 15 23 / 22%))');
  });
});

describe('Netlify deployment', () => {
  it('provides the public Supabase build variables', async () => {
    const config = await readProjectFile('netlify.toml');

    expect(config).toMatch(/VITE_SUPABASE_URL\s*=/);
    expect(config).toMatch(/VITE_SUPABASE_ANON_KEY\s*=/);
  });

  it('builds a separate private moderation page without exposing an admin link publicly', async () => {
    const config = await readProjectFile('vite.config.js');
    const admin = await readProjectFile('admin.html');
    const publicPages = await Promise.all([
      readProjectFile('index.html'),
      readProjectFile('upload.html'),
      readProjectFile('galeria.html')
    ]);

    expect(config).toContain("admin: resolve(root, 'admin.html')");
    expect(admin).toContain('data-admin-login');
    expect(admin).toContain('data-admin-password');
    expect(admin).toContain('data-admin-dashboard');
    expect(admin).toContain('noindex, nofollow');
    publicPages.forEach((html) => expect(html).not.toContain('/admin.html'));
  });
});

describe('private album moderation', () => {
  it('uses the authenticated bearer token for protected album requests', async () => {
    const script = await readProjectFile('src/admin.js');

    expect(script).toContain("Authorization: `Bearer ${accessToken}`");
  });

  it('requires an authenticated session to list and delete files', async () => {
    const script = await readProjectFile('src/admin.js');
    const policies = await readProjectFile('supabase/admin.sql');
    const readme = await readProjectFile('README.md');

    expect(script).toContain('/auth/v1/token?grant_type=password');
    expect(script).toContain('takeAuthRedirectSession');
    expect(script).toContain("['invite', 'recovery', 'signup'].includes(type)");
    expect(script).toContain("method: 'PUT'");
    expect(script).toContain('window.history.replaceState');
    expect(script).toContain('sessionStorage');
    expect(script).toContain('/rest/v1/rpc/is_album_admin');
    expect(script).toContain("download.textContent = 'Baixar arquivo'");
    expect(script).toContain('link.download = item.name');
    expect(script).toContain('URL.createObjectURL(await response.blob())');
    expect(script).toContain("method: 'DELETE'");
    expect(policies).toContain('to authenticated');
    expect(policies).toContain('alter table private.album_admins enable row level security');
    expect(policies).toContain('create or replace function public.is_album_admin()');
    expect(policies).toContain('(select private.is_album_admin())');
    expect(policies).toContain('for delete');
    expect(policies).not.toMatch(/for delete[\s\S]*?to anon/);
    expect(readme).toContain('não habilite o cadastro público');
  });
});
