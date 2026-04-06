/**
 * GSAP ScrollTrigger animations — vanilla JS.
 * Matches the v0 INTERFACE template animation patterns.
 */
(function () {
  // Respect reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  gsap.registerPlugin(ScrollTrigger);

  function init() {
    // ─── Hero parallax (content fades up on scroll) ───
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
      gsap.to(heroContent, {
        y: -100,
        opacity: 0,
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: 1,
        },
      });
    }

    // ─── Section headers slide in from left ───
    document.querySelectorAll('.section-anim-header').forEach((el) => {
      gsap.fromTo(el,
        { x: -60, opacity: 0 },
        {
          x: 0, opacity: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    // ─── Signal cards stagger in from left ───
    const signalCards = document.querySelectorAll('.signal-card');
    if (signalCards.length) {
      gsap.fromTo(signalCards,
        { x: -100, opacity: 0 },
        {
          x: 0, opacity: 1,
          duration: 0.8,
          stagger: 0.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.signals-scroll',
            start: 'top 90%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }

    // ─── Project cards stagger up ───
    const projectCards = document.querySelectorAll('.project-card');
    if (projectCards.length) {
      gsap.set(projectCards, { y: 60, opacity: 0 });
      gsap.to(projectCards, {
        y: 0, opacity: 1,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.projects-grid',
          start: 'top 90%',
          toggleActions: 'play none none reverse',
        },
      });
    }

    // ─── Principles slide in from alternating sides ───
    document.querySelectorAll('.principle').forEach((el) => {
      const isRight = el.classList.contains('align-right');
      gsap.from(el, {
        x: isRight ? 80 : -80,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      });
    });

    // ─── Highlight bars expand on scroll ───
    document.querySelectorAll('.principle-highlight-bar').forEach((bar) => {
      const container = bar.closest('.principle-highlight');
      const textEl = container.querySelector('.principle-highlight-text');

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: 'top 80%',
          end: 'top -20%',
          toggleActions: 'play reverse play reverse',
        },
      });

      tl.fromTo(bar,
        { scaleX: 0, transformOrigin: 'left center' },
        { scaleX: 1, duration: 1.2, ease: 'power3.out' }
      );

      tl.fromTo(textEl,
        { color: '#f0ede8' },
        { color: '#000000', duration: 0.6, ease: 'power2.out' },
        0.5
      );
    });

    // ─── Colophon columns fade up with stagger ───
    const colophonCols = document.querySelectorAll('.colophon-col');
    if (colophonCols.length) {
      gsap.from(colophonCols, {
        y: 40, opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.colophon-grid',
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
      });
    }

    // ─── Colophon footer fade in ───
    const colophonFooter = document.querySelector('.colophon-footer');
    if (colophonFooter) {
      gsap.from(colophonFooter, {
        y: 20, opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: colophonFooter,
          start: 'top 95%',
          toggleActions: 'play none none reverse',
        },
      });
    }
  }

  // ─── Side nav active tracking ───
  function initSideNav() {
    const buttons = document.querySelectorAll('.side-nav-btn');
    const sections = [];

    buttons.forEach((btn) => {
      const id = btn.dataset.section;
      const section = document.getElementById(id);
      if (section) sections.push({ id, el: section, btn });

      btn.addEventListener('click', () => {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          buttons.forEach((b) => b.classList.remove('active'));
          const match = sections.find((s) => s.el === entry.target);
          if (match) match.btn.classList.add('active');
        }
      });
    }, { threshold: 0.3 });

    sections.forEach((s) => observer.observe(s.el));
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initSideNav(); });
  } else {
    init();
    initSideNav();
  }
})();
