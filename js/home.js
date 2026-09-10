(() => {
  const MOBILE_BREAKPOINT = 768;
  const PRELOAD_FRAME_COUNT = 30; // just enough to make the piece feel instant on click
  const PRELOAD_CONCURRENCY = 4; // stay light — this is a background nice-to-have, not the priority

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });
  }

  async function preloadFrames(piece, folder, files) {
    const subset = files.slice(0, PRELOAD_FRAME_COUNT);
    let next = 0;
    async function worker() {
      while (next < subset.length) {
        const file = subset[next++];
        await preloadImage(`${piece}/images/${folder}/${file}`);
      }
    }
    const workers = Array.from({ length: Math.min(PRELOAD_CONCURRENCY, subset.length) }, worker);
    await Promise.all(workers);
  }

  // Returns the parsed manifest, the string 'missing' when the server said
  // 404 (piece genuinely not published), or null on a transient failure
  // (network drop, or the HTML landing a beat before the manifest during a
  // deploy). Retries a few times with backoff before giving up.
  async function fetchManifest(piece) {
    const delays = [400, 1000, 2500, 5000];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${piece}/manifest.json`, { cache: 'no-store' });
        if (res.ok) return res.json();
        if (res.status === 404) return 'missing';
      } catch (e) {
        // network hiccup — fall through to the retry
      }
      if (attempt >= delays.length) return null;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  async function setUpThumb(link) {
    const piece = link.dataset.piece;
    const manifest = await fetchManifest(piece);

    // Genuinely not published yet — leave the thumbnail dim and unclickable.
    if (manifest === 'missing') return;

    // Couldn't reach the manifest, but the link itself is still valid and
    // the piece page runs its own loader — enable it rather than stranding
    // the visitor on a dead thumbnail. Just skip the preload.
    if (!manifest) {
      link.classList.add('ready');
      return;
    }

    // Prefer the current viewport's own frames, but a piece that only has
    // the other device's frames exported so far shouldn't sit disabled —
    // fall back to whichever set actually exists.
    const preferred = isMobile() ? 'mobile' : 'desktop';
    const fallback = isMobile() ? 'desktop' : 'mobile';
    const folder = (manifest[preferred] || []).length ? preferred : fallback;
    const files = manifest[folder] || [];

    link.classList.add('ready');
    if (files.length) {
      preloadFrames(piece, folder, files); // fire and forget, quietly warms the cache
    }
  }

  document.querySelectorAll('.thumb-link').forEach(setUpThumb);
})();
