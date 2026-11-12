chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.picked) chrome.storage.local.set({ picked: message.picked });
});
