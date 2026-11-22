// ==============================
// POPUP - CTL AUTO
// ==============================

const { DEFAULT_CONFIG, normalize, escapeHtml: esc } = globalThis.CTL;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let profiles = [];
let activeProfileId;

const active = () => profiles.find(p => p.id === activeProfileId) || profiles[0];
const cfg = () => active().config;

const UNIT_OPTS = `
    <option value="ms">ms</option>
    <option value="s">giây</option>
    <option value="m">phút</option>`;
const UNIT_LABEL = { ms: 'ms', s: 'giây', m: 'phút' };
const TYPE_LABEL = { key: 'Phím', mouse: 'Chuột', wait: 'Chờ' };
const BTN_LABEL = { left: 'Trái', right: 'Phải', middle: 'Giữa' };

const NEW_ACTION = {
    key: () => ({ type: 'key', key: 'F', mode: 'press', hold: 1, holdUnit: 's', delay: 500, delayUnit: 'ms' }),
    mouse: () => ({ type: 'mouse', button: 'left', mode: 'click', x: 0, y: 0, hold: 1, holdUnit: 's', delay: 500, delayUnit: 'ms' }),
    wait: () => ({ type: 'wait', delay: 1, delayUnit: 's' })
};


// ==============================
// LƯU TRỮ (tự động)
// ==============================

let saveTimer;

function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        active().updatedAt = Date.now();
        await chrome.storage.local.set({ profiles, activeProfileId });
        const s = $('#saved');
        s.textContent = 'Đã lưu ✓';
        s.classList.add('flash');
        setTimeout(() => { s.textContent = 'Tự động lưu'; s.classList.remove('flash'); }, 900);
    }, 250);
}

async function persistNow() {
    clearTimeout(saveTimer);
    await chrome.storage.local.set({ profiles, activeProfileId });
}


// ==============================
// RENDER: PROFILES + TABS
// ==============================

function renderProfiles() {
    $('#profile-select').innerHTML = profiles
        .map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
        .join('');
    $('#profile-select').value = activeProfileId;
    $('#delete-profile').disabled = profiles.length < 2;
}

function renderTabs() {
    const mode = cfg().mode;
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $('#pane-macro').hidden = mode !== 'macro';
    $('#pane-fishing').hidden = mode !== 'fishing';
}

function renderAll() {
    showMessage('');
    renderProfiles();
    renderTabs();
    renderActions();
    renderLoop();
    renderFishing();
    renderCommon();
}


// ==============================
// RENDER: ACTIONS
// ==============================

function summary(a) {
    const after = +a.delay ? ` → chờ ${a.delay} ${UNIT_LABEL[a.delayUnit] || 'ms'}` : '';
    if (a.type === 'wait') return `${a.delay || 0} ${UNIT_LABEL[a.delayUnit] || 'ms'}`;
    const hold = a.mode === 'hold' ? ` · giữ ${a.hold} ${UNIT_LABEL[a.holdUnit] || 's'}` : '';
    if (a.type === 'key') return `${a.key || '?'}${hold}${after}`;
    return `${BTN_LABEL[a.button] || 'Trái'} (${a.x}, ${a.y})${hold}${after}`;
}

function bodyHtml(a) {
    const typeSel = `
        <label class="narrow">Loại
            <select data-k="type">
                <option value="key">Phím</option>
                <option value="mouse">Chuột</option>
                <option value="wait">Chờ</option>
            </select>
        </label>`;

    const delay = a.type === 'wait'
        ? `<label>Thời gian chờ <input data-k="delay" type="number" min="0" step="any" value="${esc(a.delay)}"></label>
           <label class="narrow">Đơn vị <select data-k="delayUnit">${UNIT_OPTS}</select></label>`
        : `<label>Chờ sau đó <input data-k="delay" type="number" min="0" step="any" value="${esc(a.delay)}"></label>
           <label class="narrow">Đơn vị <select data-k="delayUnit">${UNIT_OPTS}</select></label>`;

    const hold = `
        <div class="row" data-hold>
            <label>Thời gian giữ <input data-k="hold" type="number" min="0" step="any" value="${esc(a.hold ?? 1)}"></label>
            <label class="narrow">Đơn vị <select data-k="holdUnit">${UNIT_OPTS}</select></label>
        </div>`;

    if (a.type === 'key') {
        return `
            <div class="row">${typeSel}
                <label>Phím <input data-k="key" maxlength="20" value="${esc(a.key)}" placeholder="F, Space, Enter…"></label>
                <label class="narrow">Kiểu
                    <select data-k="mode"><option value="press">Nhấn</option><option value="hold">Giữ</option></select>
                </label>
            </div>
            ${hold}
            <div class="row">${delay}</div>`;
    }

    if (a.type === 'mouse') {
        const unset = !a.x && !a.y;
        return `
            <div class="row">${typeSel}
                <label class="narrow">Nút
                    <select data-k="button"><option value="left">Trái</option><option value="right">Phải</option><option value="middle">Giữa</option></select>
                </label>
                <label class="narrow">Kiểu
                    <select data-k="mode"><option value="click">Click</option><option value="hold">Giữ</option></select>
                </label>
            </div>
            <div class="row">
                <label class="narrow">X <input data-k="x" type="number" value="${esc(a.x)}"></label>
                <label class="narrow">Y <input data-k="y" type="number" value="${esc(a.y)}"></label>
                <div class="pick-box"><button class="pick" data-pick-action>⌖ Chọn trên trang</button></div>
            </div>
            ${unset ? '<div class="estimate" style="color:var(--red)">Chưa chọn tọa độ</div>' : ''}
            ${hold}
            <div class="row">${delay}</div>`;
    }

    return `<div class="row">${typeSel}${delay}</div>`;
}

function renderActions() {
    const list = cfg().actions;
    const box = $('#actions');

    box.innerHTML = list.map((a, i) => `
        <div class="action ${a.collapsed ? 'collapsed' : ''}" data-i="${i}" data-type="${esc(a.type)}">
            <div class="a-head" data-act="toggle">
                <span class="a-idx">${i + 1}</span>
                <span class="badge">${TYPE_LABEL[a.type] || a.type}</span>
                <span class="a-summary">${esc(summary(a))}</span>
                <span class="a-tools">
                    <button data-act="up" title="Lên" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button data-act="down" title="Xuống" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
                    <button data-act="dup" title="Nhân bản">⧉</button>
                    <button data-act="del" title="Xóa">✕</button>
                </span>
            </div>
            <div class="a-body">${bodyHtml(a)}</div>
        </div>`).join('');

    // Đặt giá trị select (an toàn hơn chèn selected vào chuỗi)
    $$('#actions .action').forEach(el => {
        const a = list[+el.dataset.i];
        el.querySelectorAll('select[data-k]').forEach(s => {
            const def = { delayUnit: 'ms', holdUnit: 's', mode: a.type === 'mouse' ? 'click' : 'press', button: 'left' };
            s.value = a[s.dataset.k] ?? def[s.dataset.k];
        });
        const hold = el.querySelector('[data-hold]');
        if (hold) hold.hidden = a.mode !== 'hold';
    });

    $('#action-count').textContent = `${list.length} thao tác`;
    $('#empty').hidden = list.length > 0;
    $('#toggle-all').hidden = list.length === 0;
    $('#toggle-all').textContent = list.every(a => a.collapsed) ? 'Mở tất cả' : 'Thu gọn tất cả';
}

function refreshCard(i) {
    const el = $(`#actions .action[data-i="${i}"]`);
    if (!el) return;
    const a = cfg().actions[i];
    el.querySelector('.a-summary').textContent = summary(a);
}

// Sửa trường trong thẻ thao tác
$('#actions').addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k || k === 'type') return;
    const i = +e.target.closest('.action').dataset.i;
    const a = cfg().actions[i];
    a[k] = e.target.type === 'number' ? (+e.target.value || 0) : e.target.value;
    if (k === 'mode') {
        const hold = e.target.closest('.action').querySelector('[data-hold]');
        if (hold) hold.hidden = a.mode !== 'hold';
    }
    refreshCard(i);
    persist();
});

$('#actions').addEventListener('change', e => {
    if (e.target.dataset.k !== 'type') return;
    const i = +e.target.closest('.action').dataset.i;
    const old = cfg().actions[i];
    cfg().actions[i] = { ...NEW_ACTION[e.target.value](), delay: old.delay, delayUnit: old.delayUnit };
    renderActions();
    persist();
});

$('#actions').addEventListener('click', e => {
    const el = e.target.closest('.action');
    if (!el) return;
    const i = +el.dataset.i;
    const list = cfg().actions;

    if (e.target.closest('[data-pick-action]')) {
        return startPick({ kind: 'action', index: i });
    }

    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;

    switch (btn.dataset.act) {
        case 'toggle':
            list[i].collapsed = !list[i].collapsed;
            break;
        case 'up':
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            break;
        case 'down':
            [list[i + 1], list[i]] = [list[i], list[i + 1]];
            break;
        case 'dup':
            list.splice(i + 1, 0, { ...structuredClone(list[i]), collapsed: false });
            break;
        case 'del':
            list.splice(i, 1);
            break;
    }
    e.stopPropagation();
    renderActions();
    persist();
});

$$('[data-add]').forEach(b => b.onclick = () => {
    cfg().actions.forEach(a => a.collapsed = true);
    cfg().actions.push(NEW_ACTION[b.dataset.add]());
    renderActions();
    persist();
    $('main').scrollTo({ top: $('#actions').scrollHeight, behavior: 'smooth' });
});

$('#toggle-all').onclick = () => {
    const list = cfg().actions;
    const collapse = !list.every(a => a.collapsed);
    list.forEach(a => a.collapsed = collapse);
    renderActions();
    persist();
};


// ==============================
// LOOP
// ==============================

function renderLoop() {
    const c = cfg();
    $$('#loop-mode button').forEach(b => b.classList.toggle('on', b.dataset.v === c.loopMode));
    $('#count-wrap').hidden = c.loopMode !== 'count';
    $('#loop-count').value = c.loopCount;
}

$('#loop-mode').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    cfg().loopMode = b.dataset.v;
    renderLoop();
    persist();
};

$('#loop-count').oninput = e => {
    cfg().loopCount = Math.max(1, +e.target.value || 1);
    persist();
};


// ==============================
// FISHING
// ==============================

function coordText(x, y) {
    return (!x && !y) ? 'Chưa chọn' : `X ${x}, Y ${y}`;
}

function showRegion(el, r) {
    el.textContent = r?.w ? `X ${r.x}, Y ${r.y} · ${r.w}×${r.h}` : 'Chưa chọn vùng';
    el.classList.toggle('unset', !r?.w);
}

function showTpl(box, t) {
    if (t?.thumb) {
        box.innerHTML = '';
        const img = document.createElement('img');
        img.src = t.thumb;
        img.alt = 'Ảnh mẫu';
        box.append(img);
    } else {
        box.textContent = 'Chưa có ảnh mẫu';
    }
}

// ----- Danh sách điều kiện: nhả dây (bước 3) và thả lại (bước 2) -----

const COND_LISTS = {
    reelConds: { box: '#reel-conds', min: 1, text: 'Nhả dây', what: 'điều kiện nhả dây', step: 3, hint: 'cần <b>nhả</b>', release: true },
    recastConds: { box: '#recast-conds', min: 0, text: '', what: 'điều kiện thả lại', step: 2, hint: 'gặp vấn đề' }
};

const newCond = key => ({ method: 'text', region: null, text: COND_LISTS[key].text, template: null, threshold: 90 });

function renderCondList(key) {
    const L = COND_LISTS[key];
    const f = cfg().fishing;
    if (!Array.isArray(f[key])) f[key] = L.min ? [newCond(key)] : [];
    const list = f[key];
    const box = $(L.box);
    box.dataset.list = key;
    box.innerHTML = list.map((c, i) => `
        <div class="cond" data-ci="${i}">
            <div class="cond-head">
                <span class="num">${i + 1}</span>
                <select data-cf="method">
                    <option value="text">Chữ HTML trong vùng</option>
                    <option value="image">Hình khớp ảnh mẫu</option>
                </select>
                <button class="cond-del" data-cact="del" title="Xóa điều kiện">✕</button>
            </div>
            <div class="row">
                <div class="pick-box">
                    <span class="coord"></span>
                    <button class="pick" data-cact="region">⬚ Chọn vùng</button>
                </div>
            </div>
            ${c.method !== 'image' ? `
            <div class="row">
                <label>Chữ cần xuất hiện <input data-cf="text" value="${esc(c.text)}" placeholder="${esc(L.text || 'vd. Cá bỏ đi')}"></label>
            </div>` : `
            <div class="tpl-pair">
                <div class="tpl-col">
                    <span class="tiny">Lúc ${L.hint}</span>
                    <div class="tpl-img" data-tpl="template"></div>
                    <button data-cact="capture" data-tpl="template">📷 Chụp</button>
                </div>
                <div class="tpl-col">
                    <span class="tiny">Lúc bình thường <i>(nên có)</i></span>
                    <div class="tpl-img" data-tpl="templateNeg"></div>
                    <span class="tpl-btns">
                        <button data-cact="capture" data-tpl="templateNeg">📷 Chụp</button>
                        ${c.templateNeg ? '<button data-cact="clear-neg" title="Xóa ảnh bình thường">✕</button>' : ''}
                    </span>
                </div>
            </div>
            <div class="row">
                ${c.templateNeg
                    ? '<span class="tiny">Có ảnh bình thường: khớp khi vùng giống ảnh bên trái hơn ảnh bên phải, không dùng ngưỡng.</span>'
                    : `<label>Giống tối thiểu (%) <input data-cf="threshold" type="number" min="30" max="100" value="${esc(c.threshold ?? 90)}"></label>`}
            </div>
            <span class="tiny">Chụp: bấm 📷 rồi bấm <b>Alt+S</b> trên trang đúng lúc đó.</span>`}
            ${L.release ? `
            <div class="row">
                <label>Nhả trong (giây) <input data-cf="releaseFor" type="number" min="0" step="0.1" value="${esc(c.releaseFor ?? 0)}" title="0 = chỉ nhả khi còn khớp"></label>
                <span class="tiny" style="flex:2">Khớp thì nhả đủ số giây này rồi mới giữ lại (0 = nhả tới khi hết khớp).</span>
            </div>` : ''}
        </div>`).join('');

    box.querySelectorAll('.cond').forEach(el => {
        const c = list[+el.dataset.ci];
        el.querySelector('[data-cf=method]').value = c.method === 'image' ? 'image' : 'text';
        showRegion(el.querySelector('.coord'), c.region);
        el.querySelectorAll('.tpl-img[data-tpl]').forEach(box => showTpl(box, c[box.dataset.tpl]));
        el.querySelector('[data-cact=del]').disabled = list.length <= L.min;
    });
}

function renderConds() {
    Object.keys(COND_LISTS).forEach(renderCondList);
    $('#recast-empty').hidden = cfg().fishing.recastConds.length > 0;
}

function bindCondList(key) {
    const L = COND_LISTS[key];
    const box = $(L.box);

    box.addEventListener('input', e => {
        const k = e.target.dataset.cf;
        if (!k) return;
        const i = +e.target.closest('.cond').dataset.ci;
        const c = cfg().fishing[key][i];
        c[k] = e.target.type === 'number' ? (+e.target.value || 0) : e.target.value;
        if (k === 'method') {
            if (c.method === 'image' && !(c.threshold > 0)) c.threshold = 90;
            renderCondList(key);
        }
        persist();
    });

    box.addEventListener('click', async e => {
        const b = e.target.closest('[data-cact]');
        if (!b || b.disabled) return;
        const i = +b.closest('.cond').dataset.ci;
        const list = cfg().fishing[key];
        const label = `${L.what} ${i + 1}`;

        if (b.dataset.cact === 'del') {
            list.splice(i, 1);
            renderConds();
            persist();
        } else if (b.dataset.cact === 'region') {
            pageCommand({ command: 'pick-region', path: [key, i, 'region'] }, 'Không chọn được vùng trên trang này.');
        } else if (b.dataset.cact === 'clear-neg') {
            delete list[i].templateNeg;
            renderCondList(key);
            persist();
        } else if (b.dataset.cact === 'capture') {
            if (!list[i].region?.w) return showMessage(`Chọn vùng cho ${label} trước khi chụp mẫu.`);
            const which = b.dataset.tpl === 'templateNeg' ? 'templateNeg' : 'template';
            const moment = which === 'templateNeg' ? 'lúc bình thường' : `lúc ${L.hint.replace(/<[^>]+>/g, '')}`;
            await chrome.storage.local.set({
                captureTarget: { region: [key, i, 'region'], template: [key, i, which], label: `${label} (${moment})` }
            });
            pageCommand({ command: 'arm-capture', target: 'cond', label: `${label} — ${moment}` }, 'Không mở được trang để chụp.');
        }
    });
}

bindCondList('reelConds');
bindCondList('recastConds');

$('#add-cond').onclick = () => {
    cfg().fishing.reelConds.push(newCond('reelConds'));
    renderCondList('reelConds');
    persist();
};

$('#add-recast').onclick = () => {
    cfg().fishing.recastConds.push(newCond('recastConds'));
    renderConds();
    persist();
};

function condError(c, i, key = 'reelConds') {
    const L = COND_LISTS[key];
    const where = `${L.what} ${i + 1} (bước ${L.step})`;
    if (!c.region?.w) return `Chưa chọn vùng cho ${where}.`;
    if (c.method === 'image' && !c.template) return `Chưa chụp ảnh mẫu cho ${where}.`;
    if (c.method === 'text' && !c.text?.trim()) return `Chưa nhập chữ cho ${where}.`;
    return '';
}

function renderFishing() {
    const f = cfg().fishing;

    $$('[data-f]').forEach(el => { el.value = f[el.dataset.f] ?? ''; });

    // Ẩn/hiện trường theo lựa chọn
    $$('#pane-fishing [data-show]').forEach(el => {
        const [k, v] = el.dataset.show.split('=');
        el.classList.toggle('hidden', !v.split('|').includes(f[k]));
    });

    showRegion($('#region-text'), f.watchRegion);
    showTpl($('#tpl-img'), f.template);
    renderConds();

    for (const field of ['hook', 'reel']) {
        const el = $(`#${field}-coord`);
        const x = f[`${field}X`], y = f[`${field}Y`];
        el.textContent = coordText(x, y);
        el.classList.toggle('unset', !x && !y);
    }

    // Ước tính thời gian
    const timed = f.hookMode === 'timed';
    const fixed = (+f.castWait || 0) + (+f.reelDuration || 0) + (+f.restWait || 0);
    const per = fixed + (timed ? (+f.hookDuration || 0) : 0);
    const baits = +f.baits || 0;
    const total = baits ? `${baits} lần${timed ? ` ≈ ${Math.ceil(per * baits / 60)} phút` : ''}` : 'chạy tới khi dừng';
    $('#fish-estimate').textContent = timed
        ? `≈ ${per.toFixed(1)} giây mỗi lần thả · ${total}`
        : `${per.toFixed(1)} giây + thời gian chờ cá (tối đa ${f.watchTimeout || 0} giây) mỗi lần · ${total}`;
}

$('#pane-fishing').addEventListener('input', e => {
    const k = e.target.dataset.f;
    if (!k) return;
    cfg().fishing[k] = e.target.type === 'number' ? (+e.target.value || 0) : e.target.value;
    persist();
    if (e.target.tagName === 'SELECT' || e.target.type === 'number') renderFishing();
});

$('#pane-fishing').addEventListener('click', e => {
    const b = e.target.closest('[data-pick-fishing]');
    if (b) startPick({ kind: 'fishing', field: b.dataset.pickFishing });
});


// ==============================
// COMMON OPTIONS
// ==============================

function renderCommon() {
    $$('[data-c]').forEach(el => { el.value = cfg()[el.dataset.c] ?? 0; });
}

$$('[data-c]').forEach(el => el.oninput = () => {
    cfg()[el.dataset.c] = Math.max(0, +el.value || 0);
    persist();
});


// ==============================
// TABS
// ==============================

$$('.tabs button').forEach(b => b.onclick = () => {
    cfg().mode = b.dataset.mode;
    renderTabs();
    persist();
});


// ==============================
// PROFILES
// ==============================

function askName(title, value) {
    return new Promise(resolve => {
        const d = $('#name-dialog');
        $('#name-title').textContent = title;
        $('#name-input').value = value;
        d.returnValue = '';
        d.onclose = () => {
            const name = $('#name-input').value.trim();
            resolve(d.returnValue === 'ok' && name ? name : null);
        };
        $('#name-input').onkeydown = e => {
            if (e.key === 'Enter') { e.preventDefault(); d.close('ok'); }
        };
        d.showModal();
        $('#name-input').select();
    });
}

function addProfile(name, config) {
    const p = { id: crypto.randomUUID(), name, config: normalize(config) };
    profiles.push(p);
    activeProfileId = p.id;
    renderAll();
    persist();
}

$('#profile-select').onchange = e => {
    activeProfileId = e.target.value;
    renderAll();
    persist();
};

$('#rename-profile').onclick = async () => {
    const name = await askName('Đổi tên cấu hình', active().name);
    if (!name) return;
    active().name = name;
    renderProfiles();
    persist();
};

$('#new-profile').onclick = async () => {
    const name = await askName('Cấu hình mới', `Cấu hình ${profiles.length + 1}`);
    if (name) addProfile(name, { ...structuredClone(DEFAULT_CONFIG), actions: [] });
};

$('#dup-profile').onclick = async () => {
    const name = await askName('Nhân bản cấu hình', `${active().name} (bản sao)`);
    if (name) addProfile(name, structuredClone(cfg()));
};

$('#delete-profile').onclick = () => {
    if (profiles.length < 2) return;
    if (!confirm(`Xóa cấu hình "${active().name}"? Không hoàn tác được.`)) return;
    profiles = profiles.filter(p => p.id !== activeProfileId);
    activeProfileId = profiles[0].id;
    renderAll();
    persist();
};


// ==============================
// STATUS + MESSAGE
// ==============================

const STATUS_TEXT = { running: 'Đang chạy', stopped: 'Đã dừng', ready: 'Sẵn sàng' };

function showStatus(s) {
    const el = $('#status');
    el.textContent = STATUS_TEXT[s] || STATUS_TEXT.ready;
    el.className = `status ${STATUS_TEXT[s] ? s : 'ready'}`;
}

function showMessage(text) {
    const m = $('#message');
    m.textContent = text;
    m.hidden = !text;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.runStatus) showStatus(changes.runStatus.newValue);
});


// ==============================
// GỬI LỆNH TỚI TRANG
// ==============================

async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function sendToTab(message) {
    const tab = await activeTab();
    if (!tab?.id) throw new Error('no-tab');
    try {
        await chrome.tabs.sendMessage(tab.id, message);
    } catch {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared.js', 'content.js'] });
        await chrome.tabs.sendMessage(tab.id, message);
    }
}

function validate() {
    const c = cfg();
    if (c.mode === 'fishing') {
        const f = c.fishing;
        if (f.hookMode !== 'timed' && !f.watchRegion?.w) return 'Chưa chọn vùng theo dõi (bước 2).';
        if (f.hookMode === 'text' && !f.watchText?.trim()) return 'Chưa nhập chữ cần khớp (bước 2).';
        if (f.hookMode === 'image' && !f.template) return 'Chưa chụp ảnh mẫu (bước 2).';
        if (f.hookMode !== 'timed') {
            for (let i = 0; i < f.recastConds.length; i++) {
                const err = condError(f.recastConds[i], i, 'recastConds');
                if (err) return err;
            }
        }
        if (f.hookInput === 'mouse' && !f.hookX && !f.hookY) return 'Chưa chọn vị trí nút Giật (bước 2).';
        if (f.hookInput === 'key' && !f.hookKey?.trim()) return 'Chưa nhập phím Giật (bước 2).';
        if (f.reelInput === 'mouse' && !f.reelX && !f.reelY) return 'Chưa chọn vị trí kéo cá (bước 3).';
        if (f.reelStyle === 'watch') {
            if (!f.reelConds?.length) return 'Chưa có điều kiện nhả dây (bước 3).';
            for (let i = 0; i < f.reelConds.length; i++) {
                const err = condError(f.reelConds[i], i);
                if (err) return err;
            }
        }
        if (f.hookMode === 'timed' && !(+f.hookDuration > 0)) return 'Thời gian giật phải lớn hơn 0.';
        return '';
    }
    if (!c.actions.length) return 'Chưa có thao tác nào.';
    const bad = c.actions.findIndex(a => a.type === 'mouse' && !a.x && !a.y);
    if (bad >= 0) return `Thao tác ${bad + 1} chưa chọn tọa độ.`;
    return '';
}

async function start() {
    const err = validate();
    showMessage(err);
    if (err) return;
    await persistNow();
    try {
        await sendToTab({ command: 'start', config: cfg() });
        window.close();
    } catch {
        showMessage('Không chạy được trên trang này (trang chrome:// hoặc cửa hàng tiện ích).');
    }
}

async function stop() {
    try { await sendToTab({ command: 'stop' }); } catch {}
    showStatus('stopped');
}

async function startPick(target) {
    await persistNow();
    await chrome.storage.local.set({ pickTarget: target, pickingProfileId: activeProfileId });
    try {
        await sendToTab({ command: 'pick' });
        window.close();
    } catch {
        showMessage('Không chọn được vị trí trên trang này.');
    }
}

// Gửi lệnh tới trang rồi đóng popup để thao tác trên trang
async function pageCommand(message, failText) {
    await persistNow();
    await chrome.storage.local.set({ pickingProfileId: activeProfileId });
    try {
        await sendToTab(message);
        window.close();
    } catch {
        showMessage(failText);
    }
}

$('#pick-hook-region').onclick = () =>
    pageCommand({ command: 'pick-region', path: ['watchRegion'] }, 'Không chọn được vùng trên trang này.');

$$('[data-capture]').forEach(b => b.onclick = async () => {
    // Nút 📷 của bước Giật (nút của điều kiện nhả dây xử lý ở renderConds)
    if (!cfg().fishing.watchRegion?.w) return showMessage('Chọn vùng Giật trước khi chụp mẫu.');
    await chrome.storage.local.set({ captureTarget: { region: ['watchRegion'], template: ['template'], label: 'Giật' } });
    pageCommand({ command: 'arm-capture', target: 'hook' }, 'Không mở được trang để chụp.');
});

$$('[data-test]').forEach(b => b.onclick = () => {
    const f = cfg().fishing;
    if (b.dataset.test === 'hook') {
        if (!f.watchRegion?.w) return showMessage('Chọn vùng Giật trước.');
        if (f.hookMode === 'image' && !f.template) return showMessage('Chụp ảnh mẫu Giật trước.');
        for (let i = 0; i < f.recastConds.length; i++) {
            const err = condError(f.recastConds[i], i, 'recastConds');
            if (err) return showMessage(err);
        }
    } else {
        for (let i = 0; i < f.reelConds.length; i++) {
            const err = condError(f.reelConds[i], i);
            if (err) return showMessage(err);
        }
    }
    pageCommand({ command: 'test-watch', target: b.dataset.test }, 'Không chạy thử được trên trang này.');
});

// Popup mở lại khi đang ở trang: cập nhật vùng/ảnh mẫu vừa lưu từ trang
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.profiles || !profiles.length) return;
    const fresh = changes.profiles.newValue?.find(p => p.id === activeProfileId);
    if (!fresh) return;
    const f = fresh.config.fishing || {};
    const mine = cfg().fishing;
    Object.assign(mine, {
        watchRegion: f.watchRegion, template: f.template,
        hookX: f.hookX, hookY: f.hookY, reelX: f.reelX, reelY: f.reelY
    });
    for (const key of ['reelConds', 'recastConds']) {
        (f[key] || []).forEach((c, i) => {
            if (mine[key]?.[i]) Object.assign(mine[key][i], { region: c.region, template: c.template, templateNeg: c.templateNeg });
        });
    }
    renderFishing();
});

$('#start').onclick = start;
$('#stop').onclick = stop;

// Shift trong popup: chạy/dừng (bỏ qua khi đang gõ)
document.addEventListener('keydown', e => {
    if (e.key !== 'Shift' || e.repeat) return;
    if (e.target.closest('input, select, textarea, dialog')) return;
    e.preventDefault();
    chrome.storage.local.get('runStatus', r => r.runStatus === 'running' ? stop() : start());
});


// ==============================
// KHỞI TẠO
// ==============================

chrome.storage.local.get(['config', 'profiles', 'activeProfileId', 'runStatus'], r => {
    if (r.profiles?.length) {
        profiles = r.profiles.map(p => ({ ...p, config: normalize(p.config) }));
        activeProfileId = profiles.some(p => p.id === r.activeProfileId) ? r.activeProfileId : profiles[0].id;
    } else {
        profiles = [{ id: crypto.randomUUID(), name: 'Cấu hình 1', config: normalize(r.config || structuredClone(DEFAULT_CONFIG)) }];
        activeProfileId = profiles[0].id;
        // Cấu hình mẫu cho câu cá
        profiles.push({
            id: crypto.randomUUID(),
            name: 'Câu cá',
            config: normalize({ ...structuredClone(DEFAULT_CONFIG), mode: 'fishing', actions: [] })
        });
    }

    // Chuyển đổi thao tác chuột cũ (không có mode) sang 'click'
    profiles.forEach(p => p.config.actions.forEach(a => {
        if (a.type === 'mouse' && !a.mode) a.mode = 'click';
    }));

    renderAll();
    showStatus(r.runStatus);
    chrome.storage.local.set({ profiles, activeProfileId });
});
