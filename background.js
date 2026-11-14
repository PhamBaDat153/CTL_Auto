chrome.runtime.onMessage.addListener(message => {
  if (!message.picked) return;
  chrome.storage.local.get(['profiles', 'activeProfileId', 'config', 'pickingIndex', 'pickingProfileId'], async result => {
    const profileId = result.pickingProfileId || result.activeProfileId;
    const profile = result.profiles?.find(p => p.id === profileId);
    const action = profile?.config.actions[result.pickingIndex];
    if (action?.type === 'mouse') {
      action.x = message.picked.x;
      action.y = message.picked.y;
      profile.updatedAt = Date.now();
      await chrome.storage.local.set({ profiles: result.profiles, activeProfileId: profileId });
      if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { command: 'picked-saved' });
    } else if (result.config?.actions[result.pickingIndex]?.type === 'mouse') {
      result.config.actions[result.pickingIndex].x = message.picked.x;
      result.config.actions[result.pickingIndex].y = message.picked.y;
      await chrome.storage.local.set({ config: result.config });
      if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { command: 'picked-saved' });
    }
    await chrome.storage.local.remove(['pickingIndex', 'pickingProfileId', 'picked']);
  });
});
