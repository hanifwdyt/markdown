/* auto-scroll.js — floating play/pause button untuk view page */
(function () {
  const SPEED = 0.5; // px per frame @ 60fps ≈ 30px/s

  let scrolling = false;
  let animId = null;
  let accum = 0;

  // Buat tombol floating
  const btn = document.createElement('button');
  btn.id = 'auto-scroll-btn';
  btn.title = 'Auto-scroll';
  btn.innerHTML = '&#9654;'; // ▶
  btn.setAttribute('aria-label', 'Auto-scroll');
  document.body.appendChild(btn);

  function tick() {
    accum += SPEED;
    if (accum >= 1) {
      const px = Math.floor(accum);
      window.scrollBy(0, px);
      accum -= px;
    }
    // Berhenti kalau sudah di bawah
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
      stop();
      return;
    }
    animId = requestAnimationFrame(tick);
  }

  function start() {
    scrolling = true;
    accum = 0;
    btn.innerHTML = '&#9646;&#9646;'; // ⏸
    btn.classList.add('active');
    animId = requestAnimationFrame(tick);
  }

  function stop() {
    scrolling = false;
    cancelAnimationFrame(animId);
    animId = null;
    btn.innerHTML = '&#9654;'; // ▶
    btn.classList.remove('active');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    scrolling ? stop() : start();
  });

  // Klik di mana saja = pause (tapi bukan klik tombolnya sendiri)
  document.addEventListener('mousedown', function (e) {
    if (scrolling && e.target !== btn) stop();
  });

  // Touch scroll juga pause
  document.addEventListener('touchstart', function (e) {
    if (scrolling && e.target !== btn) stop();
  }, { passive: true });
})();
