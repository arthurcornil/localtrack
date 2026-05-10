const worker = new Worker('worker.js', { type: 'module' });
let workerReady = false;

worker.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'ready':
			workerReady = true;
			document.getElementById('loading').classList.add('hidden');
			worker.postMessage({ action: 'getProjects' });
			worker.postMessage({ action: 'getEntries' });
			worker.postMessage({ action: 'getRunningEntry' });
			break;
		case 'entries':
			renderEntries(payload);
			break;
		case 'projects':
			updateProjectList(payload);
			break;
		case 'entryAdded':
			if (payload && payload.ended_at === null) {
				runningEntry = payload;
				return ;
			}
			worker.postMessage({ action: 'getProjects' });
			worker.postMessage({ action: 'getEntries' });
			showToast('Entry saved.');
			break;
		case 'runningEntry':
			if (!payload) return;
			runningEntry = payload;
			startedAt = payload.started_at;
			timerDesc.value = payload.name;
			if (payload.project_id) {
				const project = [...allProjects].find(p => p.id === payload.project_id);
				if (project) timerProject.value = project.name;
			}
			timerInterval = setInterval(() => {
				elapsedEl.textContent = formatElapsed(Date.now() - startedAt);
			}, 1000);
			elapsedEl.classList.add('running');
			btnStart.classList.add('active');
			btnLabel.textContent = 'Stop';
			break;
		case 'entryUpdated':
			worker.postMessage({ action: 'getEntries' });
			worker.postMessage({ action: 'getProjects' });
			showToast('Entry updated.');
			if (editEntryDialog.open) editEntryDialog.close();
			break;
		case 'projectUpdated':
			worker.postMessage({ action: 'getProjects' });
			showToast('Project updated.');
			break;
		case 'opfsLocked':
			showOPFSLockedError();
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

let runningEntry = null;

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
		runningEntry.ended_at = endedAt;

        send('stopEntry', runningEntry);

        runningEntry = null;
        timerDesc.value    = '';
        timerProject.value = '';
        startedAt          = null;
        elapsedEl.textContent = '00:00:00';
        elapsedEl.classList.remove('running');
        btnStart.classList.remove('active');
        btnLabel.textContent = 'Start';
    } else {
        startedAt = Date.now();
        const projectValue = timerProject.value.trim();
        send('saveEntry', {
            name: timerDesc.value.trim() || 'Untitled',
            started_at: startedAt,
			ended_at: null,
            project_id: isNewProject(projectValue) ? null : getProjectId(projectValue),
            projectName: isNewProject(projectValue) ? projectValue : null,
        });

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
let activeProjectFilter = null;
let activePeriod = localStorage.getItem('activePeriod') ?? 'all';

const projectSummaryEl = document.getElementById('project-summary');
const entriesTitleEl   = document.getElementById('entries-title');

function getPeriodBounds() {
	const d = new Date();
	if (activePeriod === 'today') {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	}
	if (activePeriod === 'week') {
		const day  = d.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).getTime();
	}
	if (activePeriod === 'month') {
		return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
	}
	return null;
}

function periodFilteredEntries() {
	const start = getPeriodBounds();
	if (start === null) return allEntries;
	return allEntries.filter(e => e.started_at >= start);
}

function periodLabel() {
	if (activePeriod === 'today') return 'today';
	if (activePeriod === 'week')  return 'this week';
	if (activePeriod === 'month') return 'this month';
	return null;
}

function renderProjectSummary() {
	const completed = periodFilteredEntries().filter(e => e.ended_at !== null && e.project_id !== null);

	if (!completed.length || !allProjects.size) {
		projectSummaryEl.innerHTML = '';
		return;
	}

	const byProject = new Map();
	for (const e of completed) {
		byProject.set(e.project_id, (byProject.get(e.project_id) || 0) + (e.ended_at - e.started_at));
	}

	const sorted = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
	const maxMs  = sorted[0][1];

	const rows = sorted.map(([projectId, ms]) => {
		const project = [...allProjects].find(p => p.id === projectId);
		if (!project) return '';
		const pct      = Math.round((ms / maxMs) * 100);
		const isActive = activeProjectFilter === projectId;
		return `
<div class="summary-row${isActive ? ' active' : ''}" data-project-id="${projectId}">
	<div class="summary-name">${escHtml(project.name)}</div>
	<div class="summary-time">${formatDuration(ms)}</div>
	<div class="summary-bar-track"><div class="summary-bar-fill" style="width:${pct}%"></div></div>
</div>`;
	}).join('');

	projectSummaryEl.innerHTML = `<div class="summary-header"><span class="summary-title">Projects</span></div>${rows}`;

	projectSummaryEl.querySelectorAll('.summary-row').forEach(row => {
		row.addEventListener('click', () => {
			const id = Number(row.dataset.projectId);
			activeProjectFilter = activeProjectFilter === id ? null : id;
			renderProjectSummary();
			applyEntriesFilter();
		});
	});
}

function applyEntriesFilter() {
	const list  = document.getElementById('entries-list');
	const total = document.getElementById('entries-total');

	const base    = periodFilteredEntries();
	const visible = activeProjectFilter !== null
		? base.filter(e => e.project_id === activeProjectFilter)
		: base;

	if (activeProjectFilter !== null) {
		const project = [...allProjects].find(p => p.id === activeProjectFilter);
		entriesTitleEl.textContent = project ? project.name : 'Entries';
	} else {
		entriesTitleEl.textContent = 'Entries';
	}

	if (!visible.length) {
		const pl = periodLabel();
		let msg;
		if (!allEntries.length) {
			msg = 'No entries yet — start the timer or add one manually.';
		} else if (activeProjectFilter !== null) {
			msg = pl ? `No entries for this project ${pl}.` : 'No entries for this project.';
		} else {
			msg = pl ? `No entries ${pl}.` : 'No entries yet — start the timer or add one manually.';
		}
		list.innerHTML = `<div class="empty">${msg}</div>`;
		total.innerHTML = '';
		return;
	}

	total.innerHTML = `Total <span>${formatDuration(totalMs(visible))}</span>`;

	list.innerHTML = visible.map(e => {
		const dur     = e.ended_at - e.started_at;
		const project = [...allProjects].find(p => p.id == e.project_id);
		const projectTag = project
			? `<span class="entry-project">${escHtml(project.name)}</span>`
			: '';
		return `
<div class="entry" data-id="${e.id}">
	<div class="entry-desc">${escHtml(e.name)}${projectTag}</div>
	<div class="entry-time">${formatDate(e.started_at)} · ${formatTime(e.started_at)}–${formatTime(e.ended_at)}</div>
	<div class="entry-duration">${formatDuration(dur)}</div>
	<div class="entry-actions">
		<button class="btn-edit" data-id="${e.id}" title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
		<button class="btn-delete" data-id="${e.id}" title="Delete">×</button>
	</div>
</div>
`;
	}).join('');

	list.querySelectorAll('.btn-edit').forEach(btn => {
		btn.addEventListener('click', () => {
			const entry = allEntries.find(e => e.id === Number(btn.dataset.id));
			if (entry) openEditEntry(entry);
		});
	});

	list.querySelectorAll('.btn-delete').forEach(btn => {
		btn.addEventListener('click', () => send('deleteEntry', { id: Number(btn.dataset.id) }));
	});
}

function renderEntries(entries = []) {
	allEntries = entries;
	renderProjectSummary();
	applyEntriesFilter();
}

function escHtml(str) {
	return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showOPFSLockedError() {
	const overlay = document.getElementById('loading');
	overlay.querySelector('.loading-spinner').remove();
	overlay.querySelector('.loading-message').textContent =
		'localtrack is already open in another tab. Close it and reload this page.';
}

let toastTimer = null;
function showToast(msg) {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

const editEntryDialog  = document.getElementById('edit-entry-dialog');
const editEntryDesc    = document.getElementById('edit-entry-desc');
const editEntryProject = document.getElementById('edit-entry-project');
const editEntryProjectDropdown = document.getElementById('edit-entry-project-dropdown');
const editEntryStart   = document.getElementById('edit-entry-start');
const editEntryEnd     = document.getElementById('edit-entry-end');

let editingEntryId = null;

document.getElementById('edit-entry-close').addEventListener('click', () => editEntryDialog.close());
editEntryDialog.addEventListener('click', e => { if (e.target === editEntryDialog) editEntryDialog.close(); });

function openEditEntry(entry) {
	editingEntryId = entry.id;
	editEntryDesc.value  = entry.name;
	editEntryStart.value = toLocalInput(new Date(entry.started_at));
	editEntryEnd.value   = toLocalInput(new Date(entry.ended_at));
	const project = [...allProjects].find(p => p.id === entry.project_id);
	editEntryProject.value = project ? project.name : '';
	editEntryDialog.showModal();
}

document.getElementById('edit-entry-save').addEventListener('click', () => {
	const desc  = editEntryDesc.value.trim();
	const start = editEntryStart.value;
	const end   = editEntryEnd.value;

	if (!start || !end) { showToast('Please set start and end times.'); return; }
	const s = new Date(start).getTime();
	const e = new Date(end).getTime();
	if (e <= s) { showToast('End must be after start.'); return; }

	const projectValue = editEntryProject.value.trim();
	send('updateEntry', {
		id: editingEntryId,
		name: desc || 'Untitled',
		started_at: s,
		ended_at: e,
		project_id: isNewProject(projectValue) ? null : getProjectId(projectValue),
		projectName: isNewProject(projectValue) ? projectValue : null,
	});
});

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
	if (activeProjectFilter !== null && !projects.find(p => p.id === activeProjectFilter)) {
		activeProjectFilter = null;
	}
	if (projectsDialog.open) renderProjectsDialog();
	renderEntries(allEntries);
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
	list.innerHTML = projects.map(p => `
<div class="project-row" data-id="${p.id}">
	<span class="project-row-name">${escHtml(p.name)}</span>
	<div class="project-row-actions">
		<button class="btn-edit-project" data-id="${p.id}" data-name="${escHtml(p.name)}" title="Edit">EDIT</button>
		<button class="btn-delete-project" data-id="${p.id}" title="Delete" style="padding: 5px 10px;">DELETE</button>
	</div>
</div>`).join('');

	list.querySelectorAll('.btn-edit-project').forEach(btn => {
		btn.addEventListener('click', () => {
			const row = btn.closest('.project-row');
			const id  = Number(btn.dataset.id);
			row.innerHTML = `
	<input class="project-row-input" value="${escHtml(btn.dataset.name)}" />
	<div class="project-row-actions">
		<button class="btn-save-project">SAVE</button>
		<button class="btn-cancel-project">CANCEL</button>
	</div>`;
			const input = row.querySelector('.project-row-input');
			input.focus();
			input.select();
			row.querySelector('.btn-save-project').addEventListener('click', () => {
				const newName = input.value.trim();
				if (!newName) { showToast('Project name cannot be empty.'); return; }
				send('updateProject', { id, name: newName });
			});
			row.querySelector('.btn-cancel-project').addEventListener('click', () => renderProjectsDialog());
		});
	});

	list.querySelectorAll('.btn-delete-project').forEach(btn => {
		btn.addEventListener('click', () => send('deleteProject', { id: Number(btn.dataset.id) }));
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
setupProjectInput(editEntryProject, editEntryProjectDropdown);

document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === activePeriod));

document.getElementById('period-toggle').addEventListener('click', e => {
	const btn = e.target.closest('.period-btn');
	if (!btn) return;
	activePeriod = btn.dataset.period;
	localStorage.setItem('activePeriod', activePeriod);
	activeProjectFilter = null;
	document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
	renderProjectSummary();
	applyEntriesFilter();
});
