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
let projects;

self.postMessage({ action: 'ready' });
self.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'saveEntry':
			const entry = payload;
			if (entry.projectName) {
				const projectId = addProject(JSON.stringify({ name: entry.projectName }));
				entry.project_id = projectId;
			}
			delete entry.projectName;
			addEntry(JSON.stringify(entry));
			self.postMessage({ action: 'entryAdded' });
			break;
		case 'getEntries':
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
			break;
		case 'getProjects':
			projects = JSON.parse(getProjects());
			self.postMessage({ action: 'projects', payload: projects });
			break;
		case 'deleteEntry':
			deleteEntry(payload.id);
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
			break;
		case 'deleteProject':
			const response = deleteProject(payload.id);
			projects = JSON.parse(getProjects());
			self.postMessage({ action: 'projects', payload: projects });
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
			break;
	}
}
