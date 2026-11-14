
// ==============================
// DOM ELEMENTS
// ==============================

const $ = s => document.querySelector(s);
const actions = $('#actions');

let profiles = [];
let activeProfileId;


// ==============================
// DEFAULT CONFIGURATION
// ==============================

const defaults = {
    actions: [
        {
            type: 'key',
            key: 'F',
            mode: 'press',
            hold: 1,
            holdUnit: 's',
            delay: 500,
            delayUnit: 'ms'
        }
    ],
    loopMode: 'once',
    loopCount: 10
};

const units = `
    <option value="ms">mili giây</option>
    <option value="s">giây</option>
    <option value="m">phút</option>
`;


// ==============================
// ACTION COUNT
// ==============================

function updateCount() {
    $('#action-count').textContent =
        `${actions.children.length} thao tác`;

    [...actions.children].forEach((e, i) => {
        e.querySelector('b').textContent = `Thao tác ${i + 1}`;
    });
}


// ==============================
// CREATE ACTION CARD
// ==============================

function card(a = {}, i) {
    const el = document.createElement('div');

    el.className = 'action';

    el.innerHTML = `
        <b>Thao tác ${i + 1}</b>

        <button class="remove">Xóa</button>

        <div class="row type-row">
            <label>
                Loại thao tác
                <select class="type">
                    <option value="key">Bàn phím</option>
                    <option value="mouse">Chuột</option>
                </select>
            </label>
        </div>

        <div class="details"></div>

        <div class="row">
            <label>
                Trễ sau thao tác
                <input
                    class="delay"
                    type="number"
                    min="0"
                    step="any"
                    value="${a.delay ?? 500}"
                >
            </label>

            <label>
                Đơn vị
                <select class="delayUnit">
                    ${units}
                </select>
            </label>
        </div>
    `;

    el.querySelector('.type').value = a.type || 'key';
    el.querySelector('.delayUnit').value = a.delayUnit || 'ms';

    el.querySelector('.remove').onclick = () => {
        el.remove();
        updateCount();
    };

    el.querySelector('.type').onchange = () => {
        renderDetails(el, {});
    };

    renderDetails(el, a);

    actions.append(el);
    updateCount();
}


// ==============================
// RENDER ACTION DETAILS
// ==============================

function renderDetails(el, a) {
    const d = el.querySelector('.details');

    if (el.querySelector('.type').value === 'key') {
        d.innerHTML = `
            <div class="row">
                <label>
                    Phím
                    <input
                        class="key"
                        value="${a.key || 'F'}"
                        maxlength="20"
                    >
                </label>

                <label>
                    Chế độ
                    <select class="mode">
                        <option value="press">Nhấn</option>
                        <option value="hold">Giữ</option>
                    </select>
                </label>
            </div>

            <div class="row hold-row">
                <label>
                    Thời gian giữ
                    <input
                        class="hold"
                        type="number"
                        min="0"
                        step="any"
                        value="${a.hold ?? 1}"
                    >
                </label>

                <label>
                    Đơn vị
                    <select class="holdUnit">
                        ${units}
                    </select>
                </label>
            </div>
        `;
    } else {
        d.innerHTML = `
            <div class="row">
                <label>
                    Nút chuột
                    <select class="button">
                        <option value="left">Trái</option>
                        <option value="right">Phải</option>
                        <option value="middle">Giữa</option>
                    </select>
                </label>

                <label>
                    X
                    <input
                        class="x"
                        type="number"
                        value="${a.x ?? 0}"
                    >
                </label>

                <label>
                    Y
                    <input
                        class="y"
                        type="number"
                        value="${a.y ?? 0}"
                    >
                </label>
            </div>

            <button class="pick">
                Chọn vị trí trên trang
            </button>
        `;
    }

    if (a.mode) {
        el.querySelector('.mode').value = a.mode;
    }

    if (a.holdUnit) {
        el.querySelector('.holdUnit').value = a.holdUnit;
    }

    if (a.button) {
        el.querySelector('.button').value = a.button;
    }

    const mode = el.querySelector('.mode');
    const hold = el.querySelector('.hold-row');

    if (mode) {
        const update = () => {
            hold.style.display =
                mode.value === 'hold' ? 'flex' : 'none';
        };

        mode.onchange = update;
        update();
    }

    if (el.querySelector('.pick')) {
        el.querySelector('.pick').onclick = pick;
    }
}


// ==============================
// GET ACTION DATA
// ==============================

function data() {
    return [...actions.children].map(e => {
        const a = {
            type: e.querySelector('.type').value,
            delay: +e.querySelector('.delay').value || 0,
            delayUnit: e.querySelector('.delayUnit').value
        };

        if (a.type === 'key') {
            a.key = e.querySelector('.key').value || 'F';
            a.mode = e.querySelector('.mode').value;
            a.hold = +e.querySelector('.hold').value || 0;
            a.holdUnit = e.querySelector('.holdUnit').value;
        } else {
            a.button = e.querySelector('.button').value;
            a.x = +e.querySelector('.x').value || 0;
            a.y = +e.querySelector('.y').value || 0;
        }

        return a;
    });
}


// ==============================
// CONFIGURATION
// ==============================

function currentConfig() {
    return {
        actions: data(),
        loopMode: $('#loop-mode').value,
        loopCount: +$('#loop-count').value || 1
    };
}

const config = () => ({
    actions: data(),
    loopMode: $('#loop-mode').value,
    loopCount: +$('#loop-count').value || 1
});


// ==============================
// PROFILE STORAGE
// ==============================

async function saveProfiles() {
    await chrome.storage.local.set({
        profiles,
        activeProfileId
    });
}


// ==============================
// LOAD PROFILE
// ==============================

function loadProfile(p) {
    activeProfileId = p.id;

    actions.innerHTML = '';

    p.config.actions.forEach(card);

    $('#loop-mode').value = p.config.loopMode;
    $('#loop-count').value = p.config.loopCount;

    $('#loop-mode').onchange();

    renderProfiles();
}


// ==============================
// RENDER PROFILE LIST
// ==============================

function renderProfiles() {
    const select = $('#profile-select');

    select.innerHTML = profiles.map(p => `
        <option value="${p.id}">
            ${p.name}
        </option>
    `).join('');

    select.value = activeProfileId;

    $('#profile-list').innerHTML = profiles.map(p => `
        <div class="profile-item ${p.id === activeProfileId ? 'active' : ''}">
            <span class="profile-name">
                ${p.id === activeProfileId ? '✓ ' : ''}${p.name}

                <small>
                    ${p.config.actions.length} thao tác ·
                    ${
        p.config.loopMode === 'infinite'
            ? 'Vô hạn'
            : p.config.loopMode === 'count'
                ? p.config.loopCount + ' lần'
                : 'Một lần'
    }
                </small>
            </span>

            <button data-use="${p.id}">
                ${p.id === activeProfileId ? 'Đang dùng' : 'Dùng'}
            </button>

            <button data-rename="${p.id}">
                Đổi tên
            </button>

            <button data-delete="${p.id}">
                Xóa
            </button>
        </div>
    `).join('');

    $('#profile-list')
        .querySelectorAll('[data-use]')
        .forEach(b => {
            b.onclick = () => {
                saveCurrent();

                loadProfile(
                    profiles.find(p => p.id === b.dataset.use)
                );

                saveProfiles();
            };
        });

    $('#profile-list')
        .querySelectorAll('[data-rename]')
        .forEach(b => {
            b.onclick = () => startRename(b.dataset.rename);
        });

    $('#profile-list')
        .querySelectorAll('[data-delete]')
        .forEach(b => {
            b.onclick = () => deleteProfile(b.dataset.delete);
        });
}


// ==============================
// RENAME PROFILE
// ==============================

function startRename(id = activeProfileId) {
    const p = profiles.find(p => p.id === id);

    if (!p) return;

    $('#profile-name-input').value = p.name;

    $('.rename-form').hidden = false;

    $('#profile-dialog').showModal();

    $('#profile-name-input').focus();
}


function finishRename() {
    const p = profiles.find(p => p.id === activeProfileId);
    const name = $('#profile-name-input').value.trim();

    if (!p || !name) return;

    p.name = name;

    $('.rename-form').hidden = true;

    saveProfiles();
    renderProfiles();
}


// ==============================
// DELETE PROFILE
// ==============================

function deleteProfile(id) {
    if (profiles.length < 2) {
        alert('Cần giữ lại ít nhất một cấu hình.');
        return;
    }

    if (!confirm('Bạn có chắc muốn xóa cấu hình này không?')) {
        return;
    }

    profiles = profiles.filter(p => p.id !== id);

    if (activeProfileId === id) {
        loadProfile(profiles[0]);
    }

    saveProfiles();
    renderProfiles();
}


// ==============================
// SAVE CURRENT PROFILE
// ==============================

function saveCurrent() {
    const p = profiles.find(p => p.id === activeProfileId);

    if (p) {
        p.config = currentConfig();
        p.updatedAt = Date.now();
    }
}


// ==============================
// STATUS
// ==============================

function setStatus(text, className) {
    const el = $('#status');

    el.textContent = text;
    el.className = `status ${className}`;

    chrome.storage.local.set({
        runStatus:
            className === 'running'
                ? 'running'
                : className === 'stopped'
                    ? 'stopped'
                    : 'ready'
    });
}


// ==============================
// SAVE CONFIGURATION
// ==============================

async function save() {
    await chrome.storage.local.set({
        config: {
            actions: data(),
            loopMode: $('#loop-mode').value,
            loopCount: +$('#loop-count').value || 1
        }
    });

    setStatus('Đã lưu', 'ready');

    setTimeout(() => {
        setStatus('Sẵn sàng', 'ready');
    }, 1000);
}


// ==============================
// SEND COMMAND
// ==============================

async function send(command) {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab?.id) return;

    try {
        await chrome.tabs.sendMessage(tab.id, {
            command,
            config: config()
        });
    } catch (e) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        await chrome.tabs.sendMessage(tab.id, {
            command,
            config: config()
        });
    }

    setStatus(
        command === 'start' ? 'Đang chạy' : 'Đã dừng',
        command === 'start' ? 'running' : 'stopped'
    );

    if (command === 'start' || command === 'stop') {
        window.close();
    }
}


// ==============================
// PICK MOUSE POSITION
// ==============================

async function pick(event) {
    const index = [...actions.children].indexOf(
        event.currentTarget.closest('.action')
    );

    if (index < 0) return;

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tab?.id) return;

    await chrome.storage.local.set({
        config: config(),
        pickingIndex: index
    });

    try {
        await chrome.tabs.sendMessage(tab.id, {
            command: 'pick'
        });
    } catch (e) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            await chrome.tabs.sendMessage(tab.id, {
                command: 'pick'
            });
        } catch (error) {
            setStatus(
                'Không thể chọn trên trang này',
                'stopped'
            );
        }
    }
}


// ==============================
// ACTION BUTTON EVENTS
// ==============================

$('#add-key').onclick = () => card();

$('#add-mouse').onclick = () => {
    card({ type: 'mouse' });
};

$('#save').onclick = async () => {
    saveCurrent();

    await saveProfiles();

    setStatus('Đã lưu', 'ready');
};

$('#start').onclick = () => {
    saveCurrent();
    send('start');
};

$('#stop').onclick = () => send('stop');


// ==============================
// LOOP SETTINGS EVENTS
// ==============================

$('#loop-mode').onchange = () => {
    $('#count-wrap').style.display =
        $('#loop-mode').value === 'count'
            ? 'inline-block'
            : 'none';
};


// ==============================
// PROFILE EVENTS
// ==============================

$('#profile-select').onchange = () => {
    saveCurrent();

    loadProfile(
        profiles.find(p => p.id === $('#profile-select').value)
    );

    saveProfiles();
};


$('#manage-profiles').onclick = () => {
    $('#profile-dialog').showModal();
    renderProfiles();
};


$('#close-profiles').onclick = () => {
    $('#profile-dialog').close();
};


$('#new-profile').onclick = () => {
    const name = prompt('Tên cấu hình mới:', 'Cấu hình mới');

    if (!name?.trim()) return;

    const p = {
        id: crypto.randomUUID(),
        name: name.trim(),
        config: {
            actions: [],
            loopMode: 'once',
            loopCount: 1
        }
    };

    profiles.push(p);

    loadProfile(p);
    saveProfiles();
};


$('#new-profile-top').onclick = () => {
    $('#new-profile').click();
};


$('#rename-profile').onclick = () => startRename();

$('#delete-profile-top').onclick = () => {
    deleteProfile(activeProfileId);
};


$('#cancel-rename').onclick = () => {
    $('.rename-form').hidden = true;
};


$('#confirm-rename').onclick = finishRename;


$('#profile-name-input').onkeydown = e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        finishRename();
    }

    if (e.key === 'Escape') {
        $('.rename-form').hidden = true;
    }
};


// ==============================
// KEYBOARD SHORTCUT
// ==============================

document.addEventListener('keydown', e => {
    if (e.key === 'Shift' && !e.repeat) {
        e.preventDefault();
        send('toggle');
    }
});


// ==============================
// INITIALIZE STORAGE
// ==============================

chrome.storage.local.get(
    ['config', 'profiles', 'activeProfileId', 'runStatus'],
    r => {
        if (r.profiles?.length) {
            profiles = r.profiles;

            activeProfileId =
                r.activeProfileId || profiles[0].id;
        } else {
            const c = r.config || defaults;

            profiles = [
                {
                    id: crypto.randomUUID(),
                    name: 'Cấu hình 1',
                    config: c
                }
            ];

            activeProfileId = profiles[0].id;

            saveProfiles();
        }

        loadProfile(
            profiles.find(p => p.id === activeProfileId) ||
            profiles[0]
        );

        const s = r.runStatus || 'ready';
        const el = $('#status');

        el.textContent =
            s === 'running'
                ? 'Đang chạy'
                : s === 'stopped'
                    ? 'Đã dừng'
                    : 'Sẵn sàng';

        el.className = `status ${s}`;
    }
);


// ==============================
// STORAGE CHANGE LISTENER
// ==============================

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.runStatus) return;

    const s = changes.runStatus.newValue || 'ready';
    const el = $('#status');

    el.textContent =
        s === 'running'
            ? 'Đang chạy'
            : s === 'stopped'
                ? 'Đã dừng'
                : 'Sẵn sàng';

    el.className = `status ${s}`;
});
