/* MobileInput.attach({canvas, binds, touch, gamepad, force, pointerEvents, qos}). No dependencies.
 * 1. Touch move: independently owned pointer IDs, eight-way keys, radial deadzone.
 * 2. Look: relative mousemove deltas; sensitivity, acceleration off by default.
 * 3. Buttons: configured keyboard/mouse/wheel bindings, reference-counted across sources.
 * 4. Menu: absolute cursor and tap-click; explicit MENU/POINTER toggle, Esc remains available.
 * 5. OS-paired Bluetooth/USB Gamepad API: rAF, radial deadzone/normalization, analog triggers,
 *    dpad arrows, hotplug toasts. Runs independently of touch detection.
 * 6. QoL: scoped touch suppression, safe-area CSS, optional fullscreen/orientation,
 *    wake lock and audio resume + canvas click on first gesture (best effort).
 * 7. Desktop: auto coarse/touch detection; force on/off overrides ?touch=1/0; no global capture.
 * pointerEvents enables SDL3's PointerEvent adapter; mobileInputRelative requires the small
 * SDL bridge shipped with UT2004. Other ports consume the standard MouseEvents alone.
 * destroy() releases held input, listeners, rAF and wake lock. setMenuMode(bool) is optional.
 */
(() => {
  'use strict';
  function attach(config) {
    const {canvas, binds = {}, touch = {}, gamepad = {}, qos = {}} = config;
    const host = canvas.parentElement;
    const query = new URLSearchParams(location.search).get('touch');
    const enabled = config.force === 'on' || (config.force !== 'off' &&
      (query === '1' || (query !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0))));
    const abort = new AbortController();
    const listen = (node, type, fn, options = {}) => node.addEventListener(type, fn, {...options, signal: abort.signal});
    const sources = new Map(), held = new Map(), touches = new Map();
    let menu = false, destroyed = false, frame, previous = 0, wake, waking = false, unlocked = false, toastTimer;
    let mouseButtons = 0, cursor = {x: .5, y: .5};
    const root = document.createElement('div');
    root.className = 'mobile-input';
    root.hidden = !enabled;
    const toast = document.createElement('div');
    toast.className = 'mobile-input-toast'; toast.setAttribute('role', 'status'); toast.hidden = true;
    host.append(root, toast);
    host.classList.toggle('mobile-input-host', enabled);
    const bounds = () => canvas.getBoundingClientRect();
    const position = () => { const r = bounds(); return {clientX: r.left + cursor.x * r.width, clientY: r.top + cursor.y * r.height}; };
    function mouse(type, extra = {}, relative = !menu) {
      const init = {bubbles: true, cancelable: true, ...position(), buttons: mouseButtons, ...extra};
      if (config.pointerEvents) {
        const event = new PointerEvent(type.replace('mouse', 'pointer'), {...init, pointerId: 1, pointerType: 'mouse', isPrimary: true});
        Object.defineProperty(event, 'mobileInputRelative', {value: relative || type !== 'mousemove'});
        canvas.dispatchEvent(event);
      }
      canvas.dispatchEvent(new MouseEvent(type, init));
    }
    const resolve = action => binds[action] || action;
    function emit(binding, down) {
      if (typeof binding === 'string') binding = {code: binding};
      if (binding.mouse !== undefined) {
        const mask = [1, 4, 2][binding.mouse];
        mouseButtons = down ? mouseButtons | mask : mouseButtons & ~mask;
        mouse(down ? 'mousedown' : 'mouseup', {button: binding.mouse});
      } else if (binding.wheel !== undefined) {
        if (down) canvas.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: binding.wheel, ...position()}));
      } else {
        const code = binding.code;
        const key = binding.key || (/^Key/.test(code) ? code.slice(3).toLowerCase() : /^Digit/.test(code) ? code.slice(5) : {Space:' ',Escape:'Escape',Enter:'Enter',Tab:'Tab'}[code] || code);
        const keyCode = binding.keyCode || (/^Key/.test(code) ? code.charCodeAt(3) : /^F\d+$/.test(code) ? 111 + Number(code.slice(1)) : {Space:32,Escape:27,Enter:13,Tab:9,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[code] || 0);
        canvas.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {bubbles:true, cancelable:true, code, key, keyCode, which:keyCode}));
      }
    }
    function set(source, actions) {
      const next = new Map(actions.map(action => { const binding = resolve(action); return [JSON.stringify(binding), binding]; }));
      const old = sources.get(source) || new Map();
      for (const [id, binding] of old) if (!next.has(id)) {
        const count = held.get(id) - 1;
        if (count) held.set(id, count); else { held.delete(id); emit(binding, false); }
      }
      for (const [id, binding] of next) if (!old.has(id)) {
        const count = held.get(id) || 0; held.set(id, count + 1); if (!count) emit(binding, true);
      }
      if (next.size) sources.set(source, next); else sources.delete(source);
    }
    function release() {
      for (const source of [...sources.keys()]) set(source, []);
      touches.clear();
      stick.style.setProperty('--stick-x', '0px'); stick.style.setProperty('--stick-y', '0px');
    }
    function radial(x, y, deadzone) {
      const length = Math.hypot(x, y);
      if (length <= deadzone) return [0, 0];
      const scale = (Math.min(length, 1) - deadzone) / (1 - deadzone) / length;
      return [x * scale, y * scale];
    }
    function movement(source, x, y) {
      const keys = [];
      if (x < -.2) keys.push('left'); if (x > .2) keys.push('right');
      if (y < -.2) keys.push('forward'); if (y > .2) keys.push('back');
      set(source, keys);
    }
    function look(dx, dy) {
      if (!dx && !dy) return;
      if (menu) {
        const r = bounds();
        cursor.x = Math.max(0, Math.min(1, cursor.x + dx / r.width));
        cursor.y = Math.max(0, Math.min(1, cursor.y + dy / r.height));
        drawCursor();
      }
      mouse('mousemove', {button:-1, movementX:dx, movementY:dy});
    }
    function drawCursor() {
      const r = bounds(), h = host.getBoundingClientRect();
      pointer.style.left = `${r.left - h.left + cursor.x * r.width}px`;
      pointer.style.top = `${r.top - h.top + cursor.y * r.height}px`;
    }
    function setMenuMode(value) {
      release(); menu = !!value;
      root.classList.toggle('mobile-input-menu', menu);
      toggle.textContent = menu ? 'PLAY / LOOK' : 'MENU / POINTER';
      toggle.setAttribute('aria-pressed', String(menu));
      pointer.hidden = !menu;
      if (menu) { document.exitPointerLock?.(); drawCursor(); }
    }
    async function keepAwake() {
      if (qos.keepAwake === false || wake || waking || document.hidden || destroyed) return;
      waking = true;
      try {
        const lock = await navigator.wakeLock?.request('screen');
        if (destroyed) await lock?.release();
        else if (lock) { wake = lock; lock.addEventListener('release', () => { wake = null; }); }
      } catch (_) {} finally { waking = false; }
    }
    function gesture() {
      canvas.focus({preventScroll:true});
      // Retry after asynchronous engine startup if the first gesture preceded audio creation.
      try { Promise.resolve(qos.audioUnlock?.()).catch(() => {}); } catch (_) {}
      canvas.dispatchEvent(new MouseEvent('click', {bubbles:true, ...position()}));
      if (unlocked) return;
      unlocked = true;
      keepAwake();
      if (qos.fullscreen && enabled) {
        try { Promise.resolve(host.requestFullscreen?.()).then(() => {
          if (qos.orientation) return screen.orientation?.lock(qos.orientation);
        }).catch(() => {}); } catch (_) {}
      }
    }
    function element(tag, className, label) {
      const e = document.createElement(tag); e.className = className;
      if (label) { e.textContent = label; e.setAttribute('aria-label', label); }
      if (tag === 'button') e.type = 'button';
      root.append(e); return e;
    }
    const surface = element('div', 'mobile-input-look'); surface.dataset.control = 'look';
    surface.setAttribute('aria-label', 'Drag to look; in pointer mode tap to click');
    surface.hidden = touch.look === false;
    const stick = element('div', 'mobile-input-stick'); stick.dataset.control = 'stick';
    stick.setAttribute('aria-label', 'Movement stick'); stick.hidden = touch.stick === false;
    stick.append(document.createElement('span'));
    const pointer = element('span', 'mobile-input-cursor', '+'); pointer.hidden = true;
    const toggle = element('button', 'mobile-input-toggle', 'MENU / POINTER');
    toggle.dataset.control = 'toggle'; toggle.hidden = touch.menuMode === false;
    toggle.setAttribute('aria-pressed', 'false');
    for (const button of touch.buttons || []) {
      const e = element('button', 'mobile-input-button', button.label);
      e.dataset.control = 'button'; e.dataset.action = button.key || button.id;
      e.dataset.id = button.id;
      if (button.size) e.style.setProperty('--button-size', `${button.size}px`);
    }
    listen(root, 'pointerdown', e => {
      const control = e.target.closest('[data-control]');
      if (!control || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation(); gesture();
      const kind = control.dataset.control;
      if (kind === 'toggle') { setMenuMode(!menu); return; }
      if ([...touches.values()].some(t => t.kind === kind && kind !== 'button')) return;
      control.setPointerCapture(e.pointerId);
      const r = control.getBoundingClientRect();
      const t = {kind, control, x:e.clientX, y:e.clientY, startX:e.clientX, startY:e.clientY, distance:0, time:performance.now(), cx:r.left+r.width/2, cy:r.top+r.height/2, radius:r.width/2};
      touches.set(e.pointerId, t);
      if (kind === 'button') set(`touch:${e.pointerId}`, [control.dataset.action]);
      if (kind === 'look' && menu) {
        const r = bounds();
        cursor = {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
        drawCursor(); mouse('mousemove', {button:-1});
      }
    });
    listen(root, 'pointermove', e => {
      const t = touches.get(e.pointerId); if (!t) return;
      e.preventDefault(); e.stopPropagation();
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.distance += Math.hypot(dx,dy); t.x = e.clientX; t.y = e.clientY;
      if (t.kind === 'stick') {
        const [x,y] = radial((e.clientX-t.cx)/t.radius, (e.clientY-t.cy)/t.radius, touch.deadzone ?? .15);
        stick.style.setProperty('--stick-x', `${x*t.radius*.6}px`); stick.style.setProperty('--stick-y', `${y*t.radius*.6}px`);
        movement(`touch:${e.pointerId}`, x, y);
      } else if (t.kind === 'look') {
        const gain = menu ? 1 : (touch.sensitivity ?? 1) * (touch.acceleration ? 1 + Math.hypot(dx,dy)/40 : 1);
        look(dx*gain, dy*gain);
      }
    });
    function end(e) {
      const t = touches.get(e.pointerId); if (!t) return;
      e.preventDefault(); e.stopPropagation();
      set(`touch:${e.pointerId}`, []); touches.delete(e.pointerId);
      if (t.kind === 'stick') { stick.style.setProperty('--stick-x','0px'); stick.style.setProperty('--stick-y','0px'); }
      if (e.type === 'pointerup' && t.kind === 'look' && menu && t.distance < 10 && performance.now()-t.time < 500) {
        set('tap', [{mouse:0}]); setTimeout(() => { if (!destroyed) set('tap', []); }, 60);
      }
    }
    for (const name of ['pointerup','pointercancel','lostpointercapture']) listen(root, name, end);
    // Touch-generated compatibility clicks must not reach the canvas a second time.
    listen(root, 'click', e => {
      const control = e.target.closest('button');
      if (!control || e.detail !== 0 || !e.isTrusted) return;
      gesture();
      if (control.dataset.control === 'toggle') setMenuMode(!menu);
      else { set('keyboard-button', [control.dataset.action]); setTimeout(() => { if (!destroyed) set('keyboard-button', []); }, 100); }
    });
    for (const name of ['click','dblclick','contextmenu','touchstart','touchmove']) listen(root, name, e => { e.preventDefault(); e.stopPropagation(); }, {passive:false});
    listen(canvas, 'pointerdown', e => { if (e.isTrusted) gesture(); });
    listen(window, 'blur', release);
    listen(document, 'visibilitychange', () => { if (document.hidden) { release(); wake?.release().catch(() => {}); } else if (unlocked) keepAwake(); });
    function notify(message) {
      toast.textContent = message; toast.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
    }
    listen(window, 'gamepadconnected', e => notify(`Controller connected: ${e.gamepad.id}`));
    listen(window, 'gamepaddisconnected', e => {
      for (const source of [...sources.keys()]) if (source.startsWith(`pad:${e.gamepad.index}:`)) set(source, []);
      notify(`Controller disconnected: ${e.gamepad.id}`);
    });
    function poll(now) {
      const dt = Math.min((now - (previous || now)) / 1000, .05); previous = now;
      const seen = new Set();
      // Form fields retain their keyboard semantics; focus the canvas to activate a pad.
      if (!document.hidden && document.hasFocus() && document.activeElement === canvas && gamepad !== false) {
        for (const pad of navigator.getGamepads?.() || []) {
          if (!pad?.connected) continue;
          const prefix = `pad:${pad.index}:`; seen.add(prefix);
          const [x,y] = radial(pad.axes[0] || 0, pad.axes[1] || 0, gamepad.deadzone ?? .15);
          movement(prefix+'move', x,y);
          const [rx,ry] = radial(pad.axes[2] || 0, pad.axes[3] || 0, gamepad.deadzone ?? .15);
          look(rx * (gamepad.sensitivity ?? 600) * dt, ry * (gamepad.sensitivity ?? 600) * dt);
          const mapping = {...(gamepad.buttons || {}),12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'};
          for (const [index, action] of Object.entries(mapping)) {
            const b = pad.buttons[index];
            set(prefix+index, b && (b.pressed || b.value > (gamepad.triggerThreshold ?? .25)) ? [action] : []);
          }
        }
      }
      for (const source of [...sources.keys()]) if (source.startsWith('pad:') && !seen.has(source.slice(0,source.lastIndexOf(':')+1))) set(source, []);
      if (!destroyed) frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return {enabled, setMenuMode, destroy() {
      destroyed = true; release(); abort.abort(); cancelAnimationFrame(frame); clearTimeout(toastTimer);
      wake?.release().catch(() => {}); root.remove(); toast.remove(); host.classList.remove('mobile-input-host');
    }};
  }
  window.MobileInput = {attach};
})();
