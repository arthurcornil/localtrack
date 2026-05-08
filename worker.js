const root = await navigator.storage.getDirectory();

const handles = {};
for (const suffix of ["", "-journal", "-wal"]) {
    const name = "track.db" + suffix;
    const fh = await root.getFileHandle(name, { create: true });
    handles[name] = await fh.createSyncAccessHandle();
}

await fetch('wasm_exec.js')
    .then(r => r.text())
    .then(text => eval(text));
const go = new Go();
const result = await WebAssembly.instantiateStreaming(fetch("main.wasm"), go.importObject);
go.run(result.instance);
_opfs_init(handles);
initConnection();

let entries;

self.postMessage({ action: 'ready' });
self.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'addEntry':
			addEntry(JSON.stringify(payload));
			self.postMessage({ action: 'entryAdded' });
			break;
		case 'getEntries':
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
			break;
		case 'deleteEntry':
			deleteEntry(payload.id);
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
	}
}
