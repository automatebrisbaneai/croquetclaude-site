/**
 * Split-flap display animation — vanilla JS with 3D mechanical flap illusion.
 * Each character has top/bottom halves with a rotating flap panel between them.
 */
(function () {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

  class SplitFlap {
    constructor(el) {
      this.el = el;
      this.text = (el.dataset.text || '').toUpperCase();
      this.speed = parseInt(el.dataset.speed, 10) || 50;
      this.chars = this.text.split('');
      this.tiles = [];
      this.build();
      this.animate();

      el.addEventListener('mouseenter', () => this.animate());
    }

    build() {
      this.el.innerHTML = '';
      this.el.classList.add('split-flap-container');

      this.chars.forEach((char) => {
        if (char === ' ') {
          const spacer = document.createElement('div');
          spacer.className = 'split-flap-space';
          this.el.appendChild(spacer);
          this.tiles.push(null);
          return;
        }

        const tile = document.createElement('div');
        tile.className = 'split-flap-tile';

        // Top half (static, shows current char)
        const top = document.createElement('div');
        top.className = 'split-flap-top';
        const topChar = document.createElement('span');
        topChar.className = 'char';
        top.appendChild(topChar);

        // Bottom half (static, shows current char)
        const bottom = document.createElement('div');
        bottom.className = 'split-flap-bottom';
        const bottomChar = document.createElement('span');
        bottomChar.className = 'char';
        bottom.appendChild(bottomChar);

        // Flap (the rotating panel — top half that flips down)
        const flap = document.createElement('div');
        flap.className = 'split-flap-flap';
        const flapChar = document.createElement('span');
        flapChar.className = 'char';
        flap.appendChild(flapChar);

        // Divider line
        const divider = document.createElement('div');
        divider.className = 'split-flap-divider';

        tile.appendChild(top);
        tile.appendChild(bottom);
        tile.appendChild(flap);
        tile.appendChild(divider);
        tile.style.setProperty('--i', String(this.tiles.length));
        this.el.appendChild(tile);

        this.tiles.push({
          tile, topChar, bottomChar, flapChar, flap, target: char
        });
      });
    }

    animate() {
      // Clear any running intervals from previous animation
      if (this._intervals) {
        this._intervals.forEach(id => clearInterval(id));
        this._timeouts.forEach(id => clearTimeout(id));
      }
      this._intervals = [];
      this._timeouts = [];

      // Respect reduced motion — show final text immediately
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.tiles.forEach((t) => {
          if (!t) return;
          t.topChar.textContent = t.target;
          t.bottomChar.textContent = t.target;
          t.flapChar.textContent = t.target;
          t.tile.classList.remove('flipping');
          t.tile.classList.add('settled');
        });
        return;
      }

      this.tiles.forEach((t, i) => {
        if (!t) return;

        const { tile, topChar, bottomChar, flapChar, flap, target } = t;
        tile.classList.remove('settled');
        tile.classList.add('flipping');

        const baseFlips = 8;
        const startDelay = i * 120;
        let flipIndex = 0;
        const settleThreshold = baseFlips + i * 3;

        // Clear any existing content
        topChar.textContent = '';
        bottomChar.textContent = '';
        flapChar.textContent = '';

        const timeoutId = setTimeout(() => {
          let prevChar = '';

          const interval = setInterval(() => {
            if (flipIndex >= settleThreshold) {
              clearInterval(interval);
              this._intervals = this._intervals.filter(id => id !== interval);

              // Final settle
              topChar.textContent = target;
              bottomChar.textContent = target;
              flapChar.textContent = target;
              tile.classList.remove('flipping');
              tile.classList.add('settled');

              // Final flap animation
              this.flipFlap(flap, () => {
                flap.style.transform = 'rotateX(0deg)';
              });
              return;
            }

            const newChar = CHARSET[Math.floor(Math.random() * CHARSET.length)];

            // The flap shows the OLD character flipping away
            // Top/bottom update to the NEW character
            flapChar.textContent = prevChar || newChar;
            topChar.textContent = newChar;
            bottomChar.textContent = newChar;

            // Trigger flap rotation
            this.flipFlap(flap);

            prevChar = newChar;
            flipIndex++;
          }, this.speed);
          this._intervals.push(interval);
        }, startDelay);
        this._timeouts.push(timeoutId);
      });
    }

    flipFlap(flap, onComplete) {
      // Quick flip: rotateX from 0 to -90 (flap falls forward)
      flap.style.transition = 'none';
      flap.style.transform = 'rotateX(0deg)';

      // Force reflow
      flap.offsetHeight;

      flap.style.transition = 'transform 0.08s ease-in';
      flap.style.transform = 'rotateX(-90deg)';

      if (onComplete) {
        setTimeout(onComplete, 90);
      } else {
        // Reset after flip completes
        setTimeout(() => {
          flap.style.transition = 'none';
          flap.style.transform = 'rotateX(0deg)';
        }, 90);
      }
    }
  }

  // Auto-init
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-split-flap]').forEach((el) => {
      new SplitFlap(el);
    });
  });
})();
