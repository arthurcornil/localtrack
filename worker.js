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
let entry;
let project;

self.postMessage({ action: 'ready' });
self.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'saveEntry':
			entry = payload;
			if (entry.projectName) {
				const projectId = addProject(JSON.stringify({ name: entry.projectName }));
				entry.project_id = projectId;
			}
			delete entry.projectName;
			entry = JSON.parse(addEntry(JSON.stringify(entry)));
			self.postMessage({ action: 'entryAdded', payload: entry });
			break;
		case 'stopEntry':
			entry = updateEntry(JSON.stringify(payload));
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entryAdded', payload: entry });
			self.postMessage({ action: 'entries', payload: entries });
			break;
		case 'updateEntry':
			entry = payload;
			if (entry.projectName) {
				const projectId = addProject(JSON.stringify({ name: entry.projectName }));
				projects = JSON.parse(getProjects());
				entry.project_id = projectId;
				self.postMessage({ action: 'projects', payload: projects });
			}
			updateEntry(JSON.stringify(payload));
			self.postMessage({ action: 'entryUpdated' });
			break;
		case 'updateProject':
			project = payload;
			JSON.parse(updateProject(JSON.stringify(payload)))
			self.postMessage({ action: 'projectUpdated' })
			break;
		case 'getEntries':
			entries = JSON.parse(getEntries());
			self.postMessage({ action: 'entries', payload: entries });
			break;
		case 'getRunningEntry':
			entry = JSON.parse(getRunningEntry());
			self.postMessage({ action: 'runningEntry', payload: entry });
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
