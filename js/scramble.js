/**
 * Scramble text on hover — vanilla JS port of v0 INTERFACE template.
 * Text dissolves into glyphs then resolves back to the original.
 */
(function () {
  const GLYPHS = '!@#$%^&*()_+-=<>?/\\[]{}Xx';

  function scramble(el) {
    const text = el.dataset.scramble || el.textContent;
    const duration = parseFloat(el.dataset.scrambleDuration) || 0.4;
    const chars = text.split('');
    const totalChars = chars.length;
    let startTime = null;
    let locked = new Set();
    let rafId = null;

    // Start with scrambled
    el.textContent = chars.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out
      const eased = 1 - Math.pow(1 - progress, 2);
      const numLocked = Math.floor(eased * totalChars);

      for (let i = 0; i < numLocked; i++) {
        locked.add(i);
      }

      const display = chars.map((char, i) => {
        if (locked.has(i)) return char;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }).join('');

      el.textContent = display;

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        el.textContent = text;
      }
    }

    if (rafId) cancelAnimationFrame(rafId);
    startTime = null;
    locked = new Set();
    rafId = requestAnimationFrame(tick);
  }

  // Auto-init
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-scramble]').forEach((el) => {
      el.addEventListener('mouseenter', () => scramble(el));
      el.addEventListener('focus', () => scramble(el));
    });
  });
})();
