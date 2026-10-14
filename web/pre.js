Module.preRun = [function () {
  ENV.UT2004_BASE = '/opt/ut2004/System';
  const chunkSize = 1024 * 1024;
  for (const [path, size] of Object.entries(Module.fileSizes)) {
    const split = path.lastIndexOf('/');
    const dir = '/opt/ut2004/' + path.slice(0, split);
    FS.mkdirTree(dir);
    const initial = Module.configFiles[path];
    FS.createDataFile(dir, path.slice(split + 1), initial || new Uint8Array(), true, !!initial);
    if (initial) continue;
    const node = FS.lookupPath(dir + '/' + path.slice(split + 1)).node;
    node.usedBytes = size;
    const chunks = new Map();
    node.fetchRange = (position, length) => {
      const end = Math.min(size, position + length);
      const pending = [];
      for (let n = Math.floor(position / chunkSize); n * chunkSize < end; ++n) {
        if (chunks.has(n)) continue;
        pending.push((async () => {
          const start = n * chunkSize, stop = Math.min(size, start + chunkSize) - 1;
          const response = await fetch((Module.dataBaseURL || '/data3369/UT2004/') + path.split('/').map(encodeURIComponent).join('/'),
            {headers: {Range: `bytes=${start}-${stop}`}});
          if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes ${start}-${stop}/${size}`)
            throw Error(`HTTP range failed: ${path} ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length !== stop - start + 1) throw Error('Short HTTP range: ' + path);
          chunks.set(n, bytes);
        })());
      }
      return pending.length ? Promise.all(pending) : null;
    };
    // shortcut: package I/O uses fd_read/seek; add mmap/pread adapters before other I/O consumers.
    node.stream_ops = {...node.stream_ops, read(stream, buffer, offset, length, position) {
      const count = Math.max(0, Math.min(length, size - position));
      for (let copied = 0; copied < count;) {
        const at = position + copied, n = Math.floor(at / chunkSize);
        const bytes = Math.min(count - copied, chunkSize - at % chunkSize);
        buffer.set(chunks.get(n).subarray(at % chunkSize, at % chunkSize + bytes), offset + copied);
        copied += bytes;
      }
      return count;
    }};
  }
  Module.print('WASM: HTTP async filesystem ready (' + Object.keys(Module.fileSizes).length + ' files)');
}];
