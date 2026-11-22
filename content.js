// ==============================
// CONTENT SCRIPT - CTL AUTO
// ==============================

(() => {
    // Tránh chạy hai lần khi popup inject lại script
    if (window.__ctlAutoLoaded) return;
    window.__ctlAutoLoaded = true;

    const { buildPlan, toMs, foldText } = globalThis.CTL;

    let stopped = true;
    let picker, marker, hud, hudTimer;
    let testing = false;
    const heldKeys = new Set();
    const heldMouse = new Map(); // button -> {x, y}

    chrome.storage.local.set({ runStatus: 'stopped' });


    // ==============================
    // TIME
    // ==============================

    let jitterPct = 0;

    const vary = t => {
        if (!jitterPct || t <= 0) return t;
        const r = (Math.random() * 2 - 1) * (jitterPct / 100);
        return Math.max(0, t * (1 + r));
    };

    // Chờ t ms, thoát sớm nếu bị dừng
    const wait = t => new Promise(resolve => {
        if (stopped) return resolve();
        const end = setTimeout(done, Math.max(0, t));
        const poll = setInterval(() => stopped && done(), 25);
        function done() {
            clearTimeout(end);
            clearInterval(poll);
            resolve();
        }
    });


    // ==============================
    // KEYBOARD
    // ==============================

    const KEY_CODES = {
        ' ': 'Space', Space: 'Space', Enter: 'Enter', Tab: 'Tab',
        Escape: 'Escape', Esc: 'Escape',
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        Shift: 'ShiftLeft', Control: 'ControlLeft', Ctrl: 'ControlLeft', Alt: 'AltLeft',
        Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End',
        PageUp: 'PageUp', PageDown: 'PageDown'
    };

    function keyInfo(key) {
        const k = key.length === 1 ? key.toUpperCase() : key;
        const code = KEY_CODES[k] ||
            (k.length === 1 ? (/[0-9]/.test(k) ? 'Digit' + k : 'Key' + k) : k);
        // Giữ như bản cũ: chữ cái gửi dạng in hoa (game đang nhận được)
        const outKey = (k === 'Space' || k === ' ') ? ' ' : k;
        return { key: outKey, code };
    }

    const KEY_CODE_NUM = {
        Space: 32, Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46,
        ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
        ShiftLeft: 16, ControlLeft: 17, AltLeft: 18, Home: 36, End: 35, PageUp: 33, PageDown: 34
    };

    function keyTarget() {
        // Không gửi vào nút đang focus: game chặn Space/Enter trên <button> (blur + preventDefault)
        const a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(a.tagName)) {
            try { a.blur(); } catch {}
        }
        return document.querySelector('#game canvas') || document.querySelector('#game') || document.body;
    }

    function keyEvent(type, key, repeat = false) {
        const info = keyInfo(key);
        const keyCode = KEY_CODE_NUM[info.code] ||
            (/^Key[A-Z]$/.test(info.code) ? info.code.charCodeAt(3) :
             /^Digit\d$/.test(info.code) ? 48 + +info.code[5] : 0);

        const init = {
            key: info.key, code: info.code, keyCode, which: keyCode, repeat,
            bubbles: true, cancelable: true, composed: true, view: window
        };
        keyTarget().dispatchEvent(new KeyboardEvent(type, init));
    }

    // Giữ phím như bàn phím thật: keydown, rồi keydown lặp (repeat) cho tới khi nhả
    const repeatTimers = new Map();

    function holdKey(key) {
        if (heldKeys.has(key)) return;
        heldKeys.add(key);
        keyEvent('keydown', key);
        const startAt = Date.now();
        repeatTimers.set(key, setInterval(() => {
            if (Date.now() - startAt >= 300) keyEvent('keydown', key, true); // như OS: trễ ~300ms rồi lặp
        }, 33));
    }

    function releaseKey(key) {
        clearInterval(repeatTimers.get(key));
        repeatTimers.delete(key);
        if (!heldKeys.has(key)) return;
        heldKeys.delete(key);
        keyEvent('keyup', key);
    }

    async function pressKey(key, holdMs) {
        if (holdMs > 0) {
            holdKey(key);
            await wait(holdMs);
            releaseKey(key);
        } else {
            keyEvent('keydown', key);
            keyEvent('keyup', key);
        }
    }


    // ==============================
    // MOUSE
    // ==============================

    const BUTTONS = { left: 0, middle: 1, right: 2 };
    const BUTTON_MASK = { 0: 1, 1: 4, 2: 2 };

    function mouseTarget(x, y) {
        return document.elementFromPoint(x, y) ||
            document.querySelector('#game canvas') ||
            document.querySelector('#game') ||
            document.body;
    }

    function mouseOpts(x, y, button, down) {
        return {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button, buttons: down ? BUTTON_MASK[button] : 0,
            pointerId: 1, pointerType: 'mouse', isPrimary: true
        };
    }

    const hasPointer = typeof PointerEvent === 'function';

    function mouseDown(x, y, button) {
        const t = mouseTarget(x, y);
        const o = mouseOpts(x, y, button, true);
        if (hasPointer) {
            t.dispatchEvent(new PointerEvent('pointerover', o));
            t.dispatchEvent(new PointerEvent('pointermove', o));
            t.dispatchEvent(new PointerEvent('pointerdown', o));
        }
        t.dispatchEvent(new MouseEvent('mouseover', o));
        t.dispatchEvent(new MouseEvent('mousemove', o));
        t.dispatchEvent(new MouseEvent('mousedown', o));
        heldMouse.set(button, { x, y });
    }

    function mouseUp(x, y, button) {
        const t = mouseTarget(x, y);
        const o = mouseOpts(x, y, button, false);
        if (hasPointer) t.dispatchEvent(new PointerEvent('pointerup', o));
        t.dispatchEvent(new MouseEvent('mouseup', o));
        if (button === 2) t.dispatchEvent(new MouseEvent('contextmenu', o));
        else if (button === 1) t.dispatchEvent(new MouseEvent('auxclick', o));
        else t.dispatchEvent(new MouseEvent('click', o));
        heldMouse.delete(button);
    }

    async function clickMouse(x, y, button, holdMs = 0) {
        mouseDown(x, y, button);
        if (holdMs > 0) await wait(holdMs);
        mouseUp(x, y, button);
    }



    // ==============================
    // NHẬN DIỆN VÙNG (chữ / ảnh)
    // ==============================

    const FEAT_W = 32; // ảnh được thu nhỏ về rộng 32px trước khi so sánh

    const intersects = (a, r) =>
        a.right > r.x && a.left < r.x + r.w && a.bottom > r.y && a.top < r.y + r.h;

    // Lấy chữ HTML đang hiển thị nằm trong vùng
    function regionText(r) {
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let node;
        while ((node = walker.nextNode())) {
            const t = node.nodeValue;
            if (!t || !t.trim()) continue;
            const el = node.parentElement;
            if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
            if (el.closest('#ctl-auto-hud, #ctl-auto-toast')) continue;
            if (!intersects(el.getBoundingClientRect(), r)) continue;
            if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
            range.selectNodeContents(node);
            if ([...range.getClientRects()].some(rc => intersects(rc, r))) out.push(t.trim());
        }
        return out.join(' ');
    }

    // size: {w, h} cố định (dùng cho thanh độ căng); mặc định rộng 32px, cao theo tỉ lệ
    function featureFrom(source, sx, sy, sw, sh, size) {
        const w = size?.w || FEAT_W;
        const h = size?.h || Math.max(4, Math.min(64, Math.round(FEAT_W * sh / Math.max(1, sw))));
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
        const px = g.getImageData(0, 0, w, h).data;
        const rgb = new Uint8Array(w * h * 3);
        let alpha = 0, color = 0;
        for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
            rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2];
            alpha += px[i + 3];
            color += px[i] + px[i + 1] + px[i + 2];
        }
        // Trống: trong suốt hoàn toàn, hoặc đen tuyền (canvas WebGL alpha:false đọc lại ra đen)
        return { w, h, rgb, blank: alpha === 0 || color === 0 };
    }

    // Đường nhanh: đọc thẳng từ <canvas> nếu vùng chỉ có canvas
    function grabFromCanvas(r, size) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const el = document.elementFromPoint(cx, cy);
        if (!el || el.tagName !== 'CANVAS') return null;
        const rect = el.getBoundingClientRect();
        const kx = el.width / rect.width, ky = el.height / rect.height;
        try {
            const f = featureFrom(el, (r.x - rect.left) * kx, (r.y - rect.top) * ky, r.w * kx, r.h * ky, size);
            if (f.blank) return null; // WebGL không giữ buffer thì trả về trống
            f.src = 'canvas';
            return f;
        } catch {
            return null;
        }
    }

    // Đường chậm: chụp tab (Chrome cho tối đa ~2 lần/giây)
    let lastTabCapture = 0;
    async function grabFromTab(r, size) {
        const gap = 520 - (Date.now() - lastTabCapture);
        if (gap > 0) await new Promise(res => setTimeout(res, gap));
        lastTabCapture = Date.now();

        // Ẩn thanh trạng thái / thông báo / khung của tool để không lọt vào ảnh chụp
        const own = [...document.querySelectorAll('#ctl-auto-hud, #ctl-auto-toast')];
        if (marker) own.push(marker);
        const prev = own.map(el => el.style.visibility);
        own.forEach(el => { el.style.visibility = 'hidden'; });
        if (own.length) await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

        let res;
        try {
            res = await chrome.runtime.sendMessage({ capture: true }).catch(() => null);
        } finally {
            own.forEach((el, i) => { el.style.visibility = prev[i]; });
        }
        if (!res?.dataUrl) return null;
        const blob = await (await fetch(res.dataUrl)).blob();
        const bmp = await createImageBitmap(blob);
        const k = bmp.width / window.innerWidth;
        const f = featureFrom(bmp, r.x * k, r.y * k, r.w * k, r.h * k, size);
        bmp.close();
        f.src = 'tab';
        return f;
    }

    // Lấy ảnh vùng; nếu ảnh mẫu được chụp bằng cách nào thì so bằng đúng cách đó
    async function grabRegion(r, src, size) {
        if (src === 'tab') return grabFromTab(r, size);
        const f = grabFromCanvas(r, size);
        if (f || src === 'canvas') return f;
        return grabFromTab(r, size);
    }


    const b64encode = u8 => btoa(String.fromCharCode(...u8));
    const b64decode = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));

    const tplCache = new Map();
    function templateRgb(t) {
        let rgb = tplCache.get(t.data);
        if (!rgb) {
            if (tplCache.size > 20) tplCache.clear();
            rgb = b64decode(t.data);
            tplCache.set(t.data, rgb);
        }
        return rgb;
    }

    // % giống nhau (0..100) theo sai lệch màu trung bình
    function similarity(f, t) {
        if (!f || !t || f.w !== t.w || f.h !== t.h) return 0;
        const a = f.rgb, b = templateRgb(t);
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
        return 100 * (1 - diff / (a.length * 255));
    }

    // Kiểm tra một lần: trả về { hit, info }
    async function checkWatch(a) {
        const r = a.region;
        if (a.method === 'text') {
            const text = regionText(r);
            const want = foldText(a.text);
            return { hit: !!want && foldText(text).includes(want), info: text ? `“${text.slice(0, 24)}”` : 'không thấy chữ' };
        }
        const f = await grabRegion(r, a.template?.src);
        if (!f) return { hit: false, info: 'không chụp được vùng' };
        if (f.w !== a.template.w || f.h !== a.template.h) {
            return { hit: false, info: 'vùng đã đổi kích thước, cần chụp lại mẫu' };
        }
        const score = similarity(f, a.template);
        const neg = a.templateNeg;
        if (neg && neg.w === f.w && neg.h === f.h) {
            // Có ảnh lúc bình thường: khớp khi giống ảnh "cần nhả" hơn ảnh "bình thường"
            const base = similarity(f, neg);
            const hit = score > base + (+a.margin || 2);
            return { hit, info: `mẫu ${score.toFixed(0)}% / bình thường ${base.toFixed(0)}%` };
        }
        return { hit: score >= (+a.threshold || 90), info: `khớp ${score.toFixed(0)}%/${a.threshold}%` };
    }

    // Chờ tới khi khớp rồi bấm; false nếu hết giờ
    function condsReady(conds, what) {
        for (let i = 0; i < conds.length; i++) {
            const c = conds[i];
            if (!c.region?.w) { stop(`Chưa chọn vùng cho ${what} ${i + 1}`); return false; }
            if (c.method === 'image' && !c.template) { stop(`Chưa có ảnh mẫu cho ${what} ${i + 1}`); return false; }
        }
        return true;
    }

    // Chờ cá cắn rồi giật. Trả về true (đã giật), false (hết giờ) hoặc 'recast' (gặp điều kiện thả lại)
    async function runWatch(a, { dryRun = false } = {}) {
        if (!a.region?.w || (a.method === 'image' && !a.template)) {
            stop(a.method === 'image' ? 'Chưa có ảnh mẫu' : 'Chưa chọn vùng theo dõi');
            return false;
        }
        const abort = (a.abortConds || []).filter(Boolean);
        if (!condsReady(abort, 'điều kiện thả lại')) return false;

        const end = Date.now() + toMs(a.timeout || 40, 's');
        const poll = Math.max(30, +a.poll || 100);
        while (!stopped && Date.now() < end) {
            const t0 = Date.now();
            const { hit, info } = await checkWatch(a);
            if (hit && !dryRun) {
                await doInput(a.press);
                hudInfo('đã giật');
                return true;
            }
            let shown = info;
            const graceLeft = lastCastAt + toMs(a.abortGrace || 0, 's') - Date.now();
            if (!hit && abort.length && graceLeft > 0) {
                shown += ` · thả lại: chờ ${(graceLeft / 1000).toFixed(1)} giây`;
            } else if (!hit && abort.length) {
                const r = await checkConds(abort, a.abortLogic === 'all' ? 'all' : 'any');
                shown += ` · thả lại: ${r.info}`;
                if (r.hit && !dryRun) {
                    hudInfo('gặp điều kiện thả lại');
                    toast('Gặp điều kiện thả lại → thả câu lại', 'stopped');
                    return 'recast';
                }
                if (r.hit && dryRun) flashHud();
            }
            hudInfo(shown);
            if (hit && dryRun) flashHud();
            await wait(Math.max(0, poll - (Date.now() - t0)));
        }
        return false;
    }

    // Giữ phím/chuột khi vùng KHÔNG khớp, nhả khi khớp (kéo cá)
    function inputDown(p) {
        if (p.input === 'key') holdKey(p.key || 'Space');
        else mouseDown(+p.x || 0, +p.y || 0, BUTTONS[p.button] ?? 0);
    }
    function inputUp(p) {
        if (p.input === 'key') releaseKey(p.key || 'Space');
        else mouseUp(+p.x || 0, +p.y || 0, BUTTONS[p.button] ?? 0);
    }

    // Kiểm tra danh sách điều kiện: 'any' = một cái khớp là đủ, 'all' = tất cả phải khớp
    async function checkConds(conds, logic) {
        const parts = [];
        let hits = 0, holdMs = 0;
        for (let i = 0; i < conds.length; i++) {
            const { hit, info } = await checkWatch(conds[i]);
            parts.push(`${i + 1}${hit ? '✓' : '✗'} ${info}`);
            if (hit) {
                hits++;
                holdMs = Math.max(holdMs, toMs(conds[i].releaseFor || 0, 's'));
            }
            if (logic === 'any' && hit) break;      // đã đủ để nhả
            if (logic === 'all' && !hit) break;     // chắc chắn chưa đủ
        }
        const hit = logic === 'all' ? hits === conds.length : hits > 0;
        return { hit, info: parts.join(' | '), holdMs: hit ? holdMs : 0 };
    }

    // Giữ phím/chuột khi điều kiện CHƯA thỏa, nhả khi thỏa (kéo cá)
    async function runHoldWatch(a, { dryRun = false } = {}) {
        const conds = (a.conds || []).filter(Boolean);
        if (!conds.length) { stop('Chưa có điều kiện nhả dây'); return false; }
        if (!condsReady(conds, 'điều kiện nhả dây')) return false;
        const logic = a.logic === 'all' ? 'all' : 'any';
        const end = Date.now() + toMs(a.timeout || 8, 's');
        const poll = Math.max(30, +a.poll || 100);
        let holding = false;
        try {
            // Giữ ngay khi vào bước kéo, không đợi lần kiểm tra đầu
            if (!dryRun && !stopped) {
                await wait(60);
                inputDown(a.press);
                holding = true;
                hudInfo('giữ');
            }
            let releaseUntil = 0;
            while (!stopped && Date.now() < end) {
                const t0 = Date.now();

                // Đang trong thời gian "nhả trong N giây": giữ nguyên trạng thái nhả
                if (releaseUntil > t0) {
                    hudInfo(`NHẢ · còn ${((releaseUntil - t0) / 1000).toFixed(1)} giây`);
                    await wait(Math.min(poll, releaseUntil - t0));
                    continue;
                }

                const { hit, info, holdMs } = await checkConds(conds, logic);
                if (!dryRun) {
                    if (hit && holding) { inputUp(a.press); holding = false; }
                    else if (!hit && !holding) { inputDown(a.press); holding = true; }
                    if (hit && holdMs > 0) releaseUntil = Date.now() + holdMs;
                }
                hudInfo(`${hit ? 'NHẢ' : 'giữ'} · ${info}${hit && holdMs ? ` · nhả ${holdMs / 1000} giây` : ''}`);
                if (hit && dryRun) flashHud();
                await wait(Math.max(0, poll - (Date.now() - t0)));
            }
        } finally {
            if (holding) inputUp(a.press);
        }
        return true;
    }

    const getPath = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);

    // Chụp ảnh mẫu cho vùng đã chọn (Alt+S); popup ghi sẵn đích vào captureTarget
    async function captureTemplate() {
        const c = await getActiveConfig();
        const { captureTarget } = await chrome.storage.local.get('captureTarget');
        const T = captureTarget?.region
            ? captureTarget
            : { region: ['watchRegion'], template: ['template'], label: 'Giật' };
        const r = getPath(c?.fishing, T.region);
        if (!r?.w) return toast(`Chưa chọn vùng ${T.label}`, 'stopped');
        const f = await grabRegion(r, undefined, T.size);
        if (!f) return toast('Không chụp được vùng này', 'stopped');

        // Ảnh nhỏ để xem trong popup
        const thumb = new OffscreenCanvas(f.w, f.h);
        const g = thumb.getContext('2d');
        const img = g.createImageData(f.w, f.h);
        for (let i = 0, j = 0; j < f.rgb.length; i += 4, j += 3) {
            img.data[i] = f.rgb[j]; img.data[i + 1] = f.rgb[j + 1]; img.data[i + 2] = f.rgb[j + 2]; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        const blob = await thumb.convertToBlob({ type: 'image/png' });
        const thumbUrl = await new Promise(res => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
        });

        await chrome.runtime.sendMessage({
            saveFishingAt: { path: T.template, value: { w: f.w, h: f.h, src: f.src, data: b64encode(f.rgb), thumb: thumbUrl, at: Date.now() } }
        });
        toast(`Đã chụp ảnh mẫu ${T.label}`, 'running');
    }

    // Chạy thử nhận diện, không bấm gì (30 giây)
    async function testWatch(target = 'hook') {
        if (!stopped) return;
        const c = await getActiveConfig();
        const plan = buildPlan({ ...c, mode: 'fishing' });
        const type = target === 'reel' ? 'holdWatch' : 'watch';
        const a = plan.actions.find(x => x.type === type);
        if (!a) return toast('Bước này đang không dùng nhận diện', 'stopped');

        stopped = false;
        testing = true;
        chrome.storage.local.set({ runStatus: 'running' });
        showHud({ label: 'Thử nhận diện (không bấm)' }, Date.now(), 1);
        if (type === 'watch') await runWatch({ ...a, timeout: 30 }, { dryRun: true });
        else await runHoldWatch({ ...a, timeout: 30 }, { dryRun: true });
        testing = false;
        stopped = true;
        hideHud();
        chrome.storage.local.set({ runStatus: 'stopped' });
    }

    // ==============================
    // ENGINE
    // ==============================

    async function doInput(a, holdMs = 0) {
        if (a.input === 'key' || a.type === 'key') {
            await pressKey(a.key || 'F', holdMs);
        } else {
            await clickMouse(+a.x || 0, +a.y || 0, BUTTONS[a.button] ?? 0, holdMs);
        }
    }

    let lastCastAt = 0;

    async function runAction(a) {
        if (a.isCast) lastCastAt = Date.now();
        switch (a.type) {
            case 'key':
                await pressKey(a.key || 'F', a.mode === 'hold' ? vary(toMs(a.hold, a.holdUnit)) : 0);
                break;

            case 'mouse':
                await clickMouse(+a.x || 0, +a.y || 0, BUTTONS[a.button] ?? 0,
                    a.mode === 'hold' ? vary(toMs(a.hold, a.holdUnit)) : 0);
                break;

            case 'spam': {
                const every = Math.max(30, toMs(a.interval, a.intervalUnit));
                const end = Date.now() + vary(toMs(a.duration, a.durationUnit));
                while (!stopped && Date.now() < end) {
                    await doInput(a);
                    await wait(Math.min(vary(every), end - Date.now()));
                }
                break;
            }

            case 'watch': {
                const r = await runWatch(a);
                if (r !== true) return false; // hết giờ hoặc cần thả lại: bỏ bước kéo, nghỉ rồi thả câu lại
                break;
            }

            case 'holdWatch':
                if (!(await runHoldWatch(a))) return false;
                break;

            case 'wait':
            default:
                break;
        }

        await wait(vary(toMs(a.delay, a.delayUnit)));
        return true;
    }

    function releaseAll() {
        [...heldKeys].forEach(releaseKey);
        repeatTimers.forEach(clearInterval);
        repeatTimers.clear();
        heldMouse.forEach((p, b) => mouseUp(p.x, p.y, b));
        heldMouse.clear();
    }

    async function run(rawConfig) {
        if (!stopped) return;
        const plan = buildPlan(rawConfig);
        if (!plan.actions.length) {
            toast('Chưa có thao tác nào', 'stopped');
            return;
        }

        stopped = false;
        jitterPct = plan.jitter;
        chrome.storage.local.set({ runStatus: 'running' });

        const startedAt = Date.now();
        const total = plan.loopMode === 'infinite' ? Infinity
            : plan.loopMode === 'count' ? plan.loopCount : 1;

        let stopTimer;
        if (plan.stopAfterMs > 0) {
            stopTimer = setTimeout(() => stop('Hết thời gian hẹn'), plan.stopAfterMs);
        }

        showHud(plan, startedAt, total);

        let n = 0;
        while (!stopped && n < total) {
            updateHud(n + 1);
            let skipping = false;
            for (const a of plan.actions) {
                if (stopped) break;
                if (skipping && !a.always) continue;
                hudStep(a);
                if (!(await runAction(a))) skipping = true; // hết giờ chờ cá: bỏ qua kéo cá
            }
            n++;
        }

        clearTimeout(stopTimer);
        releaseAll();
        const finishedNaturally = !stopped;
        stopped = true;
        hideHud();
        chrome.storage.local.set({ runStatus: 'stopped' });
        if (finishedNaturally) toast(`Hoàn tất ${n} lượt`, 'running');
    }

    function stop(reason = 'Đã dừng') {
        if (stopped) return;
        stopped = true;
        releaseAll();
        hideHud();
        chrome.storage.local.set({ runStatus: 'stopped' });
        toast(reason, 'stopped');
    }


    // ==============================
    // HUD (hiển thị khi đang chạy)
    // ==============================

    let hudState = {};

    function showHud(plan, startedAt, total) {
        hideHud();
        hud = document.createElement('div');
        hud.id = 'ctl-auto-hud';
        Object.assign(hud.style, {
            position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)',
            zIndex: 2147483647, padding: '6px 12px', borderRadius: '999px',
            background: 'rgba(14,18,14,.88)', color: '#e9e4cf',
            border: '1px solid #c8a24a', font: '600 12px system-ui, Arial, sans-serif',
            pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px #0006'
        });
        document.documentElement.append(hud);
        hudState = { plan, startedAt, total, loop: 1, step: '' };
        hudTimer = setInterval(renderHud, 500);
        renderHud();
    }

    function updateHud(loop) { hudState.loop = loop; renderHud(); }
    function hudStep(a) { hudState.step = a.note || ''; hudState.info = ''; renderHud(); }
    function hudInfo(t) { hudState.info = t; renderHud(); }
    function flashHud() {
        if (!hud) return;
        hud.style.borderColor = '#5aa866';
        clearTimeout(hud._f);
        hud._f = setTimeout(() => hud && (hud.style.borderColor = '#c8a24a'), 300);
    }

    function renderHud() {
        if (!hud) return;
        const s = Math.floor((Date.now() - hudState.startedAt) / 1000);
        const time = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        const loop = testing ? 'khớp thì viền xanh' : hudState.total === Infinity ? `lượt ${hudState.loop}` : `lượt ${hudState.loop}/${hudState.total}`;
        const step = (hudState.step ? ` · ${hudState.step}` : '') + (hudState.info ? ` (${hudState.info})` : '');
        hud.textContent = `● ${hudState.plan.label} · ${loop}${step} · ${time} · Esc để dừng`;
    }

    function hideHud() {
        clearInterval(hudTimer);
        hud?.remove();
        hud = null;
    }


    // ==============================
    // POSITION PICKER
    // ==============================

    function pick() {
        picker?.remove();

        picker = document.createElement('div');
        Object.assign(picker.style, {
            position: 'fixed', inset: 0, zIndex: 2147483647,
            cursor: 'crosshair', background: 'rgba(0,0,0,.05)'
        });

        const guide = document.createElement('div');
        Object.assign(guide.style, {
            position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
            padding: '8px 14px', background: 'rgba(14,18,14,.92)', border: '1px solid #c8a24a',
            color: '#e9e4cf', borderRadius: '6px', font: '600 12px system-ui, Arial',
            pointerEvents: 'none'
        });
        guide.textContent = 'Click để chọn vị trí — Esc để hủy';

        const cursor = document.createElement('div');
        Object.assign(cursor.style, {
            position: 'fixed', width: '18px', height: '18px',
            border: '2px solid #c8a24a', borderRadius: '50%',
            background: 'rgba(200,162,74,.25)', pointerEvents: 'none',
            transform: 'translate(-50%, -50%)'
        });

        const coords = document.createElement('div');
        Object.assign(coords.style, {
            position: 'fixed', top: '48px', left: '50%', transform: 'translateX(-50%)',
            padding: '4px 9px', background: '#fff', border: '1px solid #c8ced6',
            borderRadius: '4px', color: '#17202a', font: '12px ui-monospace, monospace',
            pointerEvents: 'none'
        });
        coords.textContent = 'X: --, Y: --';

        picker.append(guide, cursor, coords);

        picker.onmousemove = e => {
            cursor.style.left = `${e.clientX}px`;
            cursor.style.top = `${e.clientY}px`;
            coords.textContent = `X: ${e.clientX}, Y: ${e.clientY}`;
        };

        picker.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const x = e.clientX, y = e.clientY;

            picker.remove();
            picker = null;
            showMarker(x, y);

            chrome.runtime.sendMessage({ picked: { x, y } });
        };

        document.documentElement.append(picker);
    }

    function showMarker(x, y) {
        marker?.remove();
        marker = document.createElement('div');
        Object.assign(marker.style, {
            position: 'fixed', left: `${x - 9}px`, top: `${y - 9}px`,
            width: '18px', height: '18px', border: '2px solid #c8a24a', borderRadius: '50%',
            background: 'rgba(200,162,74,.25)', zIndex: 2147483646, pointerEvents: 'none',
            transition: 'opacity .4s'
        });
        document.documentElement.append(marker);
        setTimeout(() => { if (marker) marker.style.opacity = '0'; }, 2500);
        setTimeout(() => { marker?.remove(); marker = null; }, 3000);
    }



    // ==============================
    // REGION PICKER (kéo để chọn vùng)
    // ==============================

    function pickRegion(path = ['watchRegion']) {
        picker?.remove();
        picker = document.createElement('div');
        Object.assign(picker.style, {
            position: 'fixed', inset: 0, zIndex: 2147483647,
            cursor: 'crosshair', background: 'rgba(0,0,0,.08)'
        });

        const guide = document.createElement('div');
        Object.assign(guide.style, {
            position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
            padding: '8px 14px', background: 'rgba(14,18,14,.92)', border: '1px solid #c8a24a',
            color: '#e9e4cf', borderRadius: '6px', font: '600 12px system-ui, Arial', pointerEvents: 'none'
        });
        guide.textContent = 'Kéo chuột quanh chỗ hiện chữ/nút Giật — Esc để hủy';

        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'fixed', border: '2px dashed #c8a24a', background: 'rgba(200,162,74,.15)',
            pointerEvents: 'none', display: 'none'
        });

        picker.append(guide, box);
        let start = null;

        const rectOf = e => {
            const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
            return { x, y, w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) };
        };

        picker.onmousedown = e => {
            e.preventDefault();
            start = { x: e.clientX, y: e.clientY };
            box.style.display = 'block';
        };
        picker.onmousemove = e => {
            if (!start) return;
            const r = rectOf(e);
            Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
            guide.textContent = `${r.w} × ${r.h} px`;
        };
        picker.onmouseup = e => {
            if (!start) return;
            const r = rectOf(e);
            start = null;
            if (r.w < 4 || r.h < 4) {
                box.style.display = 'none';
                guide.textContent = 'Vùng quá nhỏ, kéo lại — Esc để hủy';
                return;
            }
            picker.remove();
            picker = null;
            showRegionMarker(r);
            chrome.runtime.sendMessage({ saveFishingAt: { path, value: r } });
            toast(`Đã lưu vùng ${r.w}×${r.h}`, 'running');
        };

        document.documentElement.append(picker);
    }

    function showRegionMarker(r) {
        marker?.remove();
        marker = document.createElement('div');
        Object.assign(marker.style, {
            position: 'fixed', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`,
            border: '2px solid #c8a24a', zIndex: 2147483646, pointerEvents: 'none', transition: 'opacity .4s'
        });
        document.documentElement.append(marker);
        setTimeout(() => { if (marker) marker.style.opacity = '0'; }, 2500);
        setTimeout(() => { marker?.remove(); marker = null; }, 3000);
    }

    // ==============================
    // TOAST
    // ==============================

    function toast(text, kind, ms = 1800) {
        let el = document.getElementById('ctl-auto-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ctl-auto-toast';
            document.documentElement.append(el);
        }
        const ok = kind === 'running';
        Object.assign(el.style, {
            position: 'fixed', top: '18px', right: '18px', zIndex: 2147483647,
            padding: '9px 14px', borderRadius: '6px', font: '600 13px system-ui, Arial, sans-serif',
            pointerEvents: 'none', boxShadow: '0 3px 14px #0005',
            background: 'rgba(14,18,14,.92)',
            color: ok ? '#9fd9a8' : '#f2a7a0',
            border: `1px solid ${ok ? '#4f9a5b' : '#b0473d'}`
        });
        el.textContent = `Cổ Tiên Lộ Auto: ${text}`;
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.remove(), ms);
    }


    // ==============================
    // ACTIVE PROFILE
    // ==============================

    function getActiveConfig() {
        return new Promise(resolve => {
            chrome.storage.local.get(['profiles', 'activeProfileId', 'config'], r => {
                const p = r.profiles?.find(p => p.id === r.activeProfileId) || r.profiles?.[0];
                resolve(p?.config || r.config || null);
            });
        });
    }

    async function toggle(config) {
        if (!stopped) return stop();
        const c = config || await getActiveConfig();
        if (c) {
            toast('Đang chạy', 'running');
            run(c);
        }
    }


    // ==============================
    // KEYBOARD SHORTCUTS
    // ==============================

    const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

    document.addEventListener('keydown', e => {
        if (!e.isTrusted) return; // bỏ qua phím do chính tool gửi

        if (e.key === 'Escape' && (!stopped || picker)) {
            e.preventDefault();
            stop();
            picker?.remove();
            picker = null;
            return;
        }

        if (e.altKey && e.code === 'KeyS' && !e.repeat) {
            e.preventDefault();
            e.stopPropagation();
            captureTemplate();
            return;
        }

        if (e.key === 'Shift' && !e.repeat && !isTyping(e.target)) {
            toggle();
        }
    }, true);


    // ==============================
    // MESSAGES
    // ==============================

    chrome.runtime.onMessage.addListener(m => {
        switch (m.command) {
            case 'picked-saved': toast('Đã lưu tọa độ', 'running'); break;
            case 'start': if (stopped) { toast('Đang chạy', 'running'); run(m.config); } break;
            case 'stop': stop(); break;
            case 'toggle': toggle(m.config); break;
            case 'pick': pick(); break;
            case 'pick-region': pickRegion(Array.isArray(m.path) ? m.path : ['watchRegion']); break;
            case 'show-region': if (m.region?.w) showRegionMarker(m.region); break;
            case 'arm-capture': toast(m.target === 'hook' ? 'Bấm Alt+S lúc nút Giật đang sáng để chụp mẫu' : `Bấm Alt+S để chụp: ${m.label || 'ảnh mẫu'}`, 'running', 6000); break;
            case 'test-watch': testWatch(m.target); break;
        }
    });
})();
