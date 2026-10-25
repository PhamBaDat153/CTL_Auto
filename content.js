const state = {
  running: false,
  dungeonName: "Chưa xác định",
  available: null,
  message: "Đang kiểm tra trang game..."
};

const text = () => (document.body?.innerText || "").replace(/\s+/g, " ").trim();
const hasAny = (values) => values.some((value) => text().toLowerCase().includes(value));

function report(message, level = "info") {
  state.message = message;
  chrome.runtime.sendMessage({ type: "NHAT_KY", level, message });
}

function detectDungeonPage() {
  const isDungeon = hasAny(["phó bản", "pho ban", "dungeon"]);
  state.dungeonName = isDungeon ? "Khu vực phó bản" : "Chưa xác định";
  state.available = isDungeon;
  state.message = isDungeon ? "Đã nhận diện khu vực phó bản" : "Hãy mở khu vực phó bản";
  return { ...state };
}

function clickableButtons() {
  return [...document.querySelectorAll("button, [role='button'], a")].filter((element) => {
    const label = (element.innerText || element.getAttribute("aria-label") || "").trim();
    return label && element.offsetParent !== null;
  });
}

function findAction(labels) {
  return clickableButtons().find((element) => {
    const label = (element.innerText || element.getAttribute("aria-label") || "").toLowerCase();
    return labels.some((value) => label.includes(value));
  });
}

function dungeonList() {
  const candidates = [...document.querySelectorAll("button, [role='button'], a, [data-id], [data-dungeon-id], [class*='dungeon'], [class*='Dungeon'], [class*='phoban'], [class*='pho-ban']")]
    .filter((element) => element.offsetParent !== null)
    .filter((element) => !isMinimapElement(element))
    .map((element, index) => ({
      id: element.dataset.dungeonId || element.dataset.id || element.getAttribute("data-dungeon-id") || element.getAttribute("data-id") || `dungeon-${index}`,
      name: dungeonName(element),
      element
    }))
    .filter((item) => item.name && item.name.length >= 3 && item.name.length <= 60)
    .filter((item) => !/^(phó bản|pho ban|dungeon|bắt đầu|bat dau|vào|vao|đóng|dong|trở lại|tro lai|bản đồ|ban do|map|minimap|menu|chi tiết|chi tiet)$/i.test(item.name))
    .filter((item) => !/^(phó bản|pho ban|dungeon)\s*[:：-]/i.test(item.name));

  const seen = new Set();
  return candidates.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ id, name }) => ({ id, name }));
}

function dungeonName(element) {
  const label = element.getAttribute("aria-label") || element.dataset.name || element.innerText || element.textContent || "";
  return label.replace(/\s+/g, " ").trim();
}

function isMinimapElement(element) {
  let current = element;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const marker = `${current.id || ""} ${typeof current.className === "string" ? current.className : ""} ${current.getAttribute?.("aria-label") || ""}`.toLowerCase();
    if (/mini[-_ ]?map|bản đồ|ban do|\bmap\b/.test(marker)) return true;
  }
  return false;
}

async function runOne(settings) {
  if (settings.dungeon) {
    const selected = dungeonList().find((dungeon) => dungeon.id === settings.dungeon);
    if (selected) {
      const target = [...document.querySelectorAll("button, [role='button'], a, [data-id], [data-dungeon-id]")].find((element) =>
        (element.dataset.dungeonId || element.dataset.id || element.getAttribute("data-dungeon-id") || element.getAttribute("data-id")) === selected.id ||
        (element.innerText || "").replace(/\s+/g, " ").trim() === selected.name
      );
      if (target) target.click();
    }
  }
  const start = findAction(["bắt đầu", "bat dau", "vào phó bản", "vao pho ban", "start"]);
  if (!start) throw new Error("Không tìm thấy nút bắt đầu phó bản");
  start.click();
  report("Đã bắt đầu phó bản", "action");

  await new Promise((resolve) => setTimeout(resolve, settings.delaySeconds * 1000));

  if (settings.collectRewards) {
    const reward = findAction(["nhận thưởng", "nhan thuong", "thu thưởng", "thu thuong", "collect"]);
    if (reward) {
      reward.click();
      report("Đã nhận phần thưởng", "success");
    }
  }
}

async function runDungeon(settings) {
  if (state.running) return { ...state, message: "Tác vụ đang chạy" };
  detectDungeonPage();
  if (!state.available) return { ...state, message: "Không tìm thấy khu vực phó bản" };

  state.running = true;
  const limit = settings.runs === "one" ? 1 : 999;
  let completed = 0;
  try {
    while (completed < limit) {
      await runOne(settings);
      completed += 1;
      if (settings.runs === "one") break;
      await new Promise((resolve) => setTimeout(resolve, settings.delaySeconds * 1000));
      detectDungeonPage();
      if (!findAction(["bắt đầu", "bat dau", "vào phó bản", "vao pho ban", "start"])) break;
    }
    state.message = `Đã hoàn thành ${completed} lượt`;
    report(state.message, "success");
  } catch (error) {
    state.message = error.message;
    report(error.message, "error");
  } finally {
    state.running = false;
  }
  return { ...state, completed };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANG_THAI") sendResponse(detectDungeonPage());
  if (message.type === "DANH_SACH_PHOBAN") sendResponse({ dungeons: dungeonList(), page: detectDungeonPage() });
  if (message.type === "CHAY_PHOBAN") runDungeon(message.settings).then(sendResponse);
  if (message.type === "DUNG") {
    state.running = false;
    state.message = "Đã yêu cầu dừng";
    sendResponse({ ...state });
  }
  return true;
});

detectDungeonPage();
