// LazyFile synchronous XHR is supported in workers, not browser UI threads.
var Module = {
  print: text => postMessage({type: 'log', text}),
  printErr: text => postMessage({type: 'stderr', text}),
  onAbort: reason => postMessage({type: 'abort', reason: String(reason)}),
  onExit: code => postMessage({type: 'exit', code})
};
fetch('files.json').then(response => {
  if (!response.ok) throw new Error('manifest HTTP ' + response.status);
  return response.json();
}).then(files => {
  Module.dataManifest = files;
  importScripts('ut2004.js');
}).catch(error => { throw error; });
