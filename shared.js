// ==============================
// SHARED - dùng chung cho popup và content script
// ==============================

(() => {
    if (globalThis.CTL) return;

    const DEFAULT_FISHING = {
        castKey: 'F',
        castWait: 2,            // giây chờ sau khi thả câu

        // Cách nhận biết lúc giật: 'timed' | 'text' | 'image'
        hookMode: 'text',
        watchRegion: null,      // {x, y, w, h} theo pixel trang
        watchText: 'Giật',      // chữ cần xuất hiện trong vùng
        template: null,         // {w, h, data (base64 RGB), thumb (dataURL)}
        threshold: 90,          // % giống nhau tối thiểu (ảnh mẫu)
        watchPoll: 100,         // ms giữa mỗi lần kiểm tra
        watchTimeout: 40,       // giây chờ cá cắn tối đa

        hookInput: 'key',       // 'mouse' | 'key'
        hookKey: 'F',
        hookX: 0,
        hookY: 0,
        hookInterval: 150,      // (hẹn giờ) ms giữa mỗi lần nhấn Giật
        hookDuration: 12,       // (hẹn giờ) giây nhấn Giật liên tục

        reelInput: 'key',
        reelKey: 'R',
        reelX: 0,
        reelY: 0,
        reelStyle: 'hold',      // 'tap' | 'hold' | 'watch' (giữ, nhả khi vùng khớp)
        reelMethod: 'text',     // (cũ) 'text' | 'image'
        reelRegion: null,
        reelText: 'Nhả dây',
        reelTemplate: null,
        reelThreshold: 80,
        reelConds: null,        // [{method, region, text, template, threshold}] — điều kiện nhả dây
        reelLogic: 'any',       // 'any' (bất kỳ khớp) | 'all' (tất cả khớp)
        recastConds: [],        // điều kiện thả lại lúc chờ cá cắn (trống = tắt)
        recastLogic: 'any',
        recastGrace: 5,         // giây sau khi thả câu chưa kiểm tra điều kiện thả lại
        reelInterval: 120,      // ms giữa mỗi lần nhấp khi kéo
        reelDuration: 8,        // giây kéo cá
        reelDelay: 300,         // ms chờ sau khi giật rồi mới bắt đầu kéo
        restWait: 2,            // giây nghỉ trước lần thả tiếp theo
        baits: 30               // số lần thả câu, 0 = vô hạn
    };

    const DEFAULT_CONFIG = {
        mode: 'macro',          // 'macro' | 'fishing'
        actions: [
            { type: 'key', key: 'F', mode: 'press', hold: 1, holdUnit: 's', delay: 500, delayUnit: 'ms' }
        ],
        loopMode: 'once',
        loopCount: 10,
        jitter: 0,              // % dao động ngẫu nhiên thời gian chờ
        stopAfter: 0,           // phút, 0 = không giới hạn
        fishing: { ...DEFAULT_FISHING }
    };

    const UNIT_MS = { ms: 1, s: 1000, m: 60000 };
    const toMs = (v, u) => (+v || 0) * (UNIT_MS[u] || 1);

    // Bổ sung các trường thiếu cho cấu hình cũ
    function normalize(c = {}) {
        const fishing = { ...DEFAULT_FISHING, ...(c.fishing || {}) };
        // Cấu hình cũ chỉ có một điều kiện nhả dây → chuyển thành danh sách
        if (!Array.isArray(fishing.reelConds)) {
            fishing.reelConds = [{
                method: fishing.reelMethod || 'text',
                region: fishing.reelRegion || null,
                text: fishing.reelText || 'Nhả dây',
                template: fishing.reelTemplate || null,
                threshold: fishing.reelThreshold ?? 80
            }];
        }
        if (!Array.isArray(fishing.recastConds)) fishing.recastConds = [];
        // Đã bỏ điều kiện thanh căng
        fishing.reelConds = fishing.reelConds.filter(cd => cd && cd.method !== 'bar');
        fishing.recastConds = fishing.recastConds.filter(cd => cd && cd.method !== 'bar');
        if (!fishing.reelConds.length) {
            fishing.reelConds = [{ method: 'text', region: null, text: 'Nhả dây', template: null, threshold: 90 }];
        }
        // Đã bỏ OCR: chuyển các chỗ dùng OCR sang đọc chữ HTML
        if (fishing.hookMode === 'ocr') fishing.hookMode = 'text';
        for (const list of [fishing.reelConds, fishing.recastConds]) {
            list.forEach(cd => { if (cd && cd.method === 'ocr') cd.method = 'text'; });
        }
        return {
            ...DEFAULT_CONFIG,
            ...c,
            actions: Array.isArray(c.actions) ? c.actions : [],
            fishing
        };
    }

    // Chuyển cấu hình thành kế hoạch chạy cho engine
    function buildPlan(raw) {
        const c = normalize(raw);
        const base = {
            jitter: Math.min(50, Math.max(0, +c.jitter || 0)),
            stopAfterMs: toMs(c.stopAfter, 'm')
        };

        if (c.mode !== 'fishing') {
            return {
                ...base,
                label: 'Chuỗi thao tác',
                actions: c.actions,
                loopMode: c.loopMode,
                loopCount: Math.max(1, +c.loopCount || 1)
            };
        }

        const f = c.fishing;
        const input = (kind, key, x, y) =>
            kind === 'key' ? { input: 'key', key } : { input: 'mouse', button: 'left', x: +x || 0, y: +y || 0 };

        const reel = f.reelStyle === 'watch'
            ? {
                type: 'holdWatch',
                conds: f.reelConds,
                logic: f.reelLogic === 'all' ? 'all' : 'any',
                poll: f.watchPoll,
                timeout: f.reelDuration,
                press: input(f.reelInput, f.reelKey, f.reelX, f.reelY),
                delay: 0
            }
            : f.reelStyle === 'hold'
            ? (f.reelInput === 'key'
                ? { type: 'key', key: f.reelKey, mode: 'hold', hold: f.reelDuration, holdUnit: 's', delay: 0 }
                : { type: 'mouse', button: 'left', x: f.reelX, y: f.reelY, mode: 'hold', hold: f.reelDuration, holdUnit: 's', delay: 0 })
            : {
                type: 'spam',
                ...input(f.reelInput, f.reelKey, f.reelX, f.reelY),
                interval: f.reelInterval, intervalUnit: 'ms',
                duration: f.reelDuration, durationUnit: 's',
                delay: 0
            };

        const press = input(f.hookInput, f.hookKey, f.hookX, f.hookY);
        const hook = ['text', 'image'].includes(f.hookMode)
            ? {
                type: 'watch',
                method: f.hookMode,
                region: f.watchRegion,
                text: f.watchText,
                template: f.template,
                threshold: f.threshold,
                poll: f.watchPoll,
                timeout: f.watchTimeout,
                abortConds: f.recastConds,
                abortLogic: f.recastLogic === 'all' ? 'all' : 'any',
                abortGrace: Math.max(0, +f.recastGrace || 0),
                press,
                delay: +f.reelDelay || 0, delayUnit: 'ms',
                note: 'Chờ cá cắn'
            }
            : {
                type: 'spam', ...press,
                interval: f.hookInterval, intervalUnit: 'ms',
                duration: f.hookDuration, durationUnit: 's',
                delay: +f.reelDelay || 0, delayUnit: 'ms', note: 'Giật'
            };

        return {
            ...base,
            label: 'Câu cá',
            actions: [
                { type: 'key', key: f.castKey || 'F', mode: 'press', delay: f.castWait, delayUnit: 's', note: 'Thả câu', isCast: true },
                hook,
                { ...reel, note: 'Kéo cá' },
                { type: 'wait', delay: f.restWait, delayUnit: 's', note: 'Nghỉ', always: true }
            ],
            loopMode: +f.baits > 0 ? 'count' : 'infinite',
            loopCount: Math.max(1, +f.baits || 1)
        };
    }

    const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));

    // Bỏ dấu, chữ thường, gộp khoảng trắng: "GIẬT!" ~ "giat!"
    const foldText = s => String(s ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .toLowerCase().replace(/\s+/g, ' ').trim();

    globalThis.CTL = { DEFAULT_CONFIG, DEFAULT_FISHING, normalize, buildPlan, toMs, escapeHtml, foldText };
})();
