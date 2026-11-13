chrome.runtime.onMessage.addListener(message => {
  if (!message.picked) return;
  chrome.storage.local.get(['config', 'pickingIndex'], async result => {
    const action = result.config?.actions[result.pickingIndex];
    if (action?.type !== 'mouse') return;
    action.x = message.picked.x;
    action.y = message.picked.y;
    await chrome.storage.local.set({ config: result.config });
    await chrome.storage.local.remove(['pickingIndex', 'picked']);
  });
});
