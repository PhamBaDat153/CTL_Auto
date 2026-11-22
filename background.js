// ==============================
// BACKGROUND - CTL AUTO
// ==============================

// Cấu hình đang được sửa (ưu tiên cấu hình lúc bấm "chọn")
async function targetProfile() {
    const r = await chrome.storage.local.get(['profiles', 'activeProfileId', 'pickingProfileId']);
    const id = r.pickingProfileId || r.activeProfileId;
    const profile = r.profiles?.find(p => p.id === id) || r.profiles?.[0];
    return { profiles: r.profiles, profile };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Chụp phần đang hiển thị của tab (dùng khi vùng không phải canvas đọc được)
    if (message.capture) {
        const windowId = sender.tab?.windowId;
        chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
            .then(dataUrl => sendResponse({ dataUrl }))
            .catch(err => sendResponse({ error: String(err?.message || err) }));
        return true; // trả lời bất đồng bộ
    }

    // Lưu một giá trị theo đường dẫn trong phần câu cá, vd. ['reelConds', 1, 'region']
    if (message.saveFishingAt) {
        targetProfile().then(async ({ profiles, profile }) => {
            const { path, value } = message.saveFishingAt;
            if (!profile || !Array.isArray(path) || !path.length) return sendResponse({ ok: false });
            let obj = profile.config.fishing = profile.config.fishing || {};
            for (const k of path.slice(0, -1)) {
                if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = typeof k === 'number' ? [] : {};
                obj = obj[k];
            }
            obj[path[path.length - 1]] = value;
            profile.updatedAt = Date.now();
            await chrome.storage.local.set({ profiles });
            sendResponse({ ok: true });
        });
        return true;
    }

    // Lưu vùng theo dõi / ảnh mẫu vào phần câu cá
    if (message.saveFishing) {
        targetProfile().then(async ({ profiles, profile }) => {
            if (!profile) return sendResponse({ ok: false });
            profile.config.fishing = { ...(profile.config.fishing || {}), ...message.saveFishing };
            profile.updatedAt = Date.now();
            await chrome.storage.local.set({ profiles });
            sendResponse({ ok: true });
        });
        return true;
    }

    // Tọa độ một điểm vừa chọn trên trang
    // pickTarget: { kind: 'action', index } | { kind: 'fishing', field: 'hook' | 'reel' }
    if (message.picked) {
        chrome.storage.local.get(['pickTarget'], async r => {
            const { profiles, profile } = await targetProfile();
            const target = r.pickTarget;
            const { x, y } = message.picked;
            let saved = false;

            if (profile && target?.kind === 'action') {
                const action = profile.config.actions?.[target.index];
                if (action && action.type !== 'key' && action.type !== 'wait') {
                    action.x = x;
                    action.y = y;
                    saved = true;
                }
            } else if (profile && target?.kind === 'fishing' && ['hook', 'reel'].includes(target.field)) {
                profile.config.fishing = profile.config.fishing || {};
                profile.config.fishing[`${target.field}X`] = x;
                profile.config.fishing[`${target.field}Y`] = y;
                saved = true;
            }

            if (saved) {
                profile.updatedAt = Date.now();
                await chrome.storage.local.set({ profiles });
                if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { command: 'picked-saved' }).catch(() => {});
            }

            await chrome.storage.local.remove(['pickTarget', 'pickingProfileId']);
        });
    }
});
