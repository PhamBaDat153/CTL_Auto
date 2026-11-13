chrome.runtime.onMessage.addListener(message => {
  if (message.picked) chrome.storage.local.set({ picked: message.picked });
});
