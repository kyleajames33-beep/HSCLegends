// Schedule one wake-up at a time so a suspended projector cannot queue a burst of ticks.
self.onmessage = (event: MessageEvent<boolean>) => {
  setTimeout(() => self.postMessage(null), event.data ? 0 : 1000 / 30);
};
