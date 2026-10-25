const DEFAULT_SETTINGS = {
  enabled: false,
  dungeon: "auto",
  runs: "all",
  collectRewards: true,
  stopOnNoEnergy: true,
  stopOnError: true,
  allowItems: false,
  allowPremium: false,
  delaySeconds: 3
};

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, logs: [] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "NHAT_KY") return;
  appendLog(message.level || "info", message.message).then(() => sendResponse({ ok: true }));
  return true;
});

async function appendLog(level, message) {
  const { logs = [] } = await chrome.storage.local.get("logs");
  const next = [{ level, message, time: new Date().toLocaleTimeString("vi-VN") }, ...logs].slice(0, 30);
  await chrome.storage.local.set({ logs: next });
}
