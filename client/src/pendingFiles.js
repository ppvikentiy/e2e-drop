let queued = null;

export function queueFiles(files) {
  queued = [...files];
}

export function consumeQueuedFiles() {
  const files = queued;
  queued = null;
  return files;
}
