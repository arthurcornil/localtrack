const worker = new Worker('worker.js', { type: 'module' });
let workerReady = false;

worker.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'ready':
			workerReady = true;
			worker.postMessage({ action: 'getProjects' });
			worker.postMessage({ action: 'getEntries' });
			break;
		case 'entries':
			renderEntries(payload);
			break;
		case 'projects':
			updateProjectList(payload);
			break;
		case 'entryAdded':
			worker.postMessage({ action: 'getProjects' });
			worker.postMessage({ action: 'getEntries' });
			showToast('Entry saved.');
			break;
		case 'error':
			showToast('Something went wrong.');
			console.error(payload);
			break;
	}
};

function send(action, payload = {}) {
	if (!workerReady) return;
	worker.postMessage({ action, payload });
}

let pendingEntry = null;

let timerInterval = null;
let startedAt = null;
const elapsedEl         = document.getElementById('elapsed');
const btnStart          = document.getElementById('btn-start');
const btnLabel          = document.getElementById('btn-label');
const timerDesc         = document.getElementById('timer-desc');
const timerProject      = document.getElementById('timer-project');
const timerProjectDropdown = document.getElementById('timer-project-dropdown');

function formatElapsed(ms) {
	const s = Math.floor(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

function formatDuration(ms) {
	const totalMin = Math.round(ms / 60000);
	if (totalMin < 60) return `${totalMin}m`;
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return m ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(ts) {
	return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
	const d = new Date(ts);
	const today = new Date();
	if (d.toDateString() === today.toDateString()) return 'Today';
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

btnStart.addEventListener('click', () => {
	if (timerInterval) {
		const endedAt = Date.now();
		clearInterval(timerInterval);
		timerInterval = null;

		const projectValue = timerProject.value.trim();
		const entry = {
			name: timerDesc.value.trim() || 'Untitled',
			started_at: startedAt,
			ended_at: endedAt,
			project_id: isNewProject(projectValue) ? null : getProjectId(projectValue),
			projectName: isNewProject(projectValue) ? projectValue : null,
		};
		send('saveEntry', entry);

		timerDesc.value    = '';
		timerProject.value = '';
		startedAt          = null;
		elapsedEl.textContent = '00:00:00';
		elapsedEl.classList.remove('running');
		btnStart.classList.remove('active');
		btnLabel.textContent = 'Start';
	} else {
		startedAt = Date.now();
		timerInterval = setInterval(() => {
			elapsedEl.textContent = formatElapsed(Date.now() - startedAt);
		}, 1000);
		elapsedEl.classList.add('running');
		btnStart.classList.add('active');
		btnLabel.textContent = 'Stop';
	}
});

const manualDesc            = document.getElementById('manual-desc');
const manualProject         = document.getElementById('manual-project');
const manualProjectDropdown = document.getElementById('manual-project-dropdown');
const manualStart           = document.getElementById('manual-start');
const manualEnd             = document.getElementById('manual-end');
const btnAdd                = document.getElementById('btn-add');

function resetManualTimes() {
	const now    = new Date();
	const before = new Date(now.getTime() - 60 * 60 * 1000);
	manualEnd.value   = toLocalInput(now);
	manualStart.value = toLocalInput(before);
}

function toLocalInput(date) {
	const off = date.getTimezoneOffset() * 60000;
	return new Date(date - off).toISOString().slice(0, 16);
}

resetManualTimes();

btnAdd.addEventListener('click', () => {
	const desc  = manualDesc.value.trim();
	const start = manualStart.value;
	const end   = manualEnd.value;

	if (!start || !end) { showToast('Please set start and end times.'); return; }
	const s = new Date(start).getTime();
	const e = new Date(end).getTime();
	if (e <= s) { showToast('End must be after start.'); return; }

	const projectValue = manualProject.value.trim();
	send('saveEntry', {
		name: desc || 'Untitled',
		started_at: s,
		ended_at: e,
		project_id: isNewProject(projectValue) ? null : getProjectId(projectValue),
		projectName: isNewProject(projectValue) ? projectValue : null,
	});

	manualDesc.value    = '';
	manualProject.value = '';
	resetManualTimes();
});

function totalMs(entries) {
	return entries.reduce((sum, e) => sum + (e.ended_at - e.started_at), 0);
}

let allEntries = [];

function renderEntries(entries = []) {
	allEntries = entries;
	const list  = document.getElementById('entries-list');
	const total = document.getElementById('entries-total');

	if (!entries.length) {
		list.innerHTML  = '<div class="empty">No entries yet — start the timer or add one manually.</div>';
		total.innerHTML = '';
		return;
	}

	total.innerHTML = `Total <span>${formatDuration(totalMs(entries))}</span>`;

	list.innerHTML = entries.map(e => {
		const dur = e.ended_at - e.started_at;
		const project = [...allProjects].find(p => p.id == e.project_id);
		const projectTag = project
			? `<span class="entry-project">${escHtml(project.name)}</span>`
			: '';
		return `
<div class="entry" data-id="${e.id}">
<div class="entry-desc">${escHtml(e.name)}${projectTag}</div>
<div class="entry-time">${formatDate(e.started_at)} · ${formatTime(e.started_at)}–${formatTime(e.ended_at)}</div>
<div class="entry-duration">${formatDuration(dur)}</div>
<button class="btn-delete" data-id="${e.id}" title="Delete">×</button>
</div>
`;
	}).join('');

	list.querySelectorAll('.btn-delete').forEach(btn => {
		btn.addEventListener('click', () => send('deleteEntry', { id: Number(btn.dataset.id) }));
	});
}

function escHtml(str) {
	return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer = null;
function showToast(msg) {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

let allProjects = new Set();

function isNewProject(value) {
	if (!value) return false;
	const lower = value.toLowerCase();
	return ![...allProjects].some(p => p.name.toLowerCase() === lower);
}

function getProjectId(value) {
	if (!value) return null;
	const lower = value.toLowerCase();
	return [...allProjects].find(p => p.name.toLowerCase() === lower).id;
}

function updateProjectList(projects) {
	allProjects.clear();
	projects.forEach(project => allProjects.add(project));
	if (projectsDialog.open) renderProjectsDialog();
}

const projectsDialog = document.getElementById('projects-dialog');

document.getElementById('btn-cog').addEventListener('click', () => {
	renderProjectsDialog();
	projectsDialog.showModal();
});

document.getElementById('dialog-close').addEventListener('click', () => projectsDialog.close());

projectsDialog.addEventListener('click', e => {
	if (e.target === projectsDialog) projectsDialog.close();
});

function renderProjectsDialog() {
	const list = document.getElementById('projects-list');
	const projects = [...allProjects];
	if (!projects.length) {
		list.innerHTML = '<div class="dialog-empty">No projects yet.</div>';
		return;
	}
	list.innerHTML = projects.map(p => {
		return `
<div class="project-row">
	<span class="project-row-name">${escHtml(p.name)}</span>
	<button class="btn-delete" data-id="${p.id}" title="Delete" style="padding: 6px 10px 6px 10px;">Delete</button>
</div>`;
	}).join('');

	list.querySelectorAll('.btn-delete').forEach(btn => {
		btn.addEventListener('click', () => {
			send('deleteProject', { id: Number(btn.dataset.id) })
		});
	});
}

function updateProjectDropdown(input, dropdown) {
	const value = input.value.toLowerCase();
	const filteredProjects = [...allProjects].filter(p => 
		p.name.toLowerCase().includes(value) && p.name.toLowerCase() !== value
	);
	
	if (filteredProjects.length === 0) {
		dropdown.style.display = 'none';
		return;
	}
	
	dropdown.innerHTML = filteredProjects.map(project => 
		`<div class="project-option" data-project="${project.name}">${escHtml(project.name)}</div>`
	).join('');
	
	dropdown.style.display = 'block';
	
	dropdown.querySelectorAll('.project-option').forEach(option => {
		option.addEventListener('click', () => {
			input.value = option.dataset.project;
			dropdown.style.display = 'none';
			input.focus();
		});
	});
}

function hideDropdown(dropdown) {
	setTimeout(() => dropdown.style.display = 'none', 150);
}

function setupProjectInput(input, dropdown) {
	input.addEventListener('input', () => updateProjectDropdown(input, dropdown));
	input.addEventListener('focus', () => updateProjectDropdown(input, dropdown));
	input.addEventListener('blur', () => hideDropdown(dropdown));
}

setupProjectInput(timerProject, timerProjectDropdown);
setupProjectInput(manualProject, manualProjectDropdown);
