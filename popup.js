const $ = (id) => document.getElementById(id);
const defaults = { enabled: false, dungeon: "auto", runs: "one", collectRewards: true, stopOnNoEnergy: true, stopOnError: true, allowItems: false, allowPremium: false, delaySeconds: 3 };
let settings = { ...defaults };
let tabId = null;

async function load() {
  const stored = await chrome.storage.local.get(["settings", "logs"]);
  settings = { ...defaults, ...(stored.settings || {}) };
  renderSettings();
  renderLogs(stored.logs || []);
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tabs[0]?.id;
  if (!tabs[0]?.url?.startsWith("https://cotienlo.com/")) return setConnection(false, "Hãy mở cotienlo.com");
  chrome.tabs.sendMessage(tabId, { type: "TRANG_THAI" }, (state) => {
    if (chrome.runtime.lastError) return setConnection(false, "Chưa kết nối trang game");
    setConnection(true, state?.message || "Đã kết nối");
    loadDungeons();
  });
}

function loadDungeons() {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "DANH_SACH_PHOBAN" }, (result) => {
    if (chrome.runtime.lastError) return;
    const select = $("dungeon");
    const dungeons = result?.dungeons || [];
    select.innerHTML = dungeons.length
      ? dungeons.map((dungeon) => `<option value="${escapeHtml(dungeon.id)}">${escapeHtml(dungeon.name)}</option>`).join("")
      : '<option value="">Chưa tìm thấy phó bản</option>';
    if (settings.dungeon && dungeons.some((dungeon) => dungeon.id === settings.dungeon)) select.value = settings.dungeon;
    else if (dungeons[0]) { settings.dungeon = dungeons[0].id; save(); }
  });
}

function renderSettings() {
  $("toggle").classList.toggle("active", settings.enabled);
  $("status").textContent = settings.enabled ? "Sẵn sàng tự động" : "Tự động đang tắt";
  $("runs").value = settings.runs;
  $("delay").value = settings.delaySeconds;
  $("delayValue").textContent = settings.delaySeconds;
  ["collectRewards", "stopOnNoEnergy", "stopOnError", "allowItems", "allowPremium"].forEach((id) => $(id).checked = settings[id]);
}

function setConnection(connected, message) {
  $("connection").textContent = connected ? "Đã kết nối" : "Ngoại tuyến";
  $("connection").className = `status ${connected ? "online" : "offline"}`;
  $("detail").textContent = message;
}

function renderLogs(logs) {
  $("logs").innerHTML = logs.length ? logs.map((log) => `<li><span>${log.time}</span>${escapeHtml(log.message)}</li>`).join("") : '<li class="muted">Chưa có hoạt động.</li>';
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
async function save() { await chrome.storage.local.set({ settings }); }

$("toggle").addEventListener("click", async () => { settings.enabled = !settings.enabled; await save(); renderSettings(); });
$("runs").addEventListener("change", async (event) => { settings.runs = event.target.value; await save(); });
$("dungeon").addEventListener("change", async (event) => { settings.dungeon = event.target.value; await save(); });
$("delay").addEventListener("input", async (event) => { settings.delaySeconds = Number(event.target.value); $("delayValue").textContent = settings.delaySeconds; await save(); });
["collectRewards", "stopOnNoEnergy", "stopOnError", "allowItems", "allowPremium"].forEach((id) => $(id).addEventListener("change", async (event) => { settings[id] = event.target.checked; await save(); }));

$("run").addEventListener("click", () => {
  if (!tabId) return setConnection(false, "Không tìm thấy tab game");
  $("run").disabled = true;
  $("run").textContent = "ĐANG CHẠY...";
  chrome.tabs.sendMessage(tabId, { type: "CHAY_PHOBAN", settings }, (result) => {
    $("run").disabled = false;
    $("run").textContent = "BẮT ĐẦU CHẠY PHÓ BẢN";
    if (chrome.runtime.lastError) return setConnection(false, "Không thể kết nối trang game");
    setConnection(true, result?.message || "Đã hoàn tất");
    load();
  });
});

$("clear").addEventListener("click", async () => { await chrome.storage.local.set({ logs: [] }); renderLogs([]); });
load();
