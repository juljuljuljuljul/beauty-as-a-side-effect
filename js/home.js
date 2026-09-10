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

  async function fetchManifest(piece) {
    // A single miss shouldn't leave the thumbnail dead forever — during a
    // deploy the HTML can land a beat before the manifest, and phones drop
    // requests. Retry a few times with a short backoff before giving up.
    const delays = [400, 1000, 2500];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${piece}/manifest.json`, { cache: 'no-store' });
        if (res.ok) return res.json();
      } catch (e) {
        // network hiccup — fall through to the retry
      }
      if (attempt >= delays.length) return null;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  async function setUpThumb(link) {
    const piece = link.dataset.piece;
    try {
      const manifest = await fetchManifest(piece);
      if (!manifest) return;

      // Prefer the current viewport's own frames, but a piece that only has
      // the other device's frames exported so far shouldn't sit disabled —
      // fall back to whichever set actually exists.
      const preferred = isMobile() ? 'mobile' : 'desktop';
      const fallback = isMobile() ? 'desktop' : 'mobile';
      const folder = (manifest[preferred] || []).length ? preferred : fallback;
      const files = manifest[folder] || [];
      if (files.length === 0) return;

      link.classList.add('ready');
      preloadFrames(piece, folder, files); // fire and forget, quietly warms the cache
    } catch (e) {
      // piece not published yet — leave the thumbnail dim and unclickable
    }
  }

  document.querySelectorAll('.thumb-link').forEach(setUpThumb);
})();
