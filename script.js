const worker = new Worker('worker.js', { type: 'module' });
let workerReady = false;

worker.onmessage = ({ data }) => {
	const { action, payload } = data;
	switch (action) {
		case 'ready':
			workerReady = true;
			worker.postMessage({ action: 'getEntries' });
			break;
		case 'entries':
			renderEntries(payload);
			break;
		case 'entryAdded':
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

let timerInterval = null;
let startedAt = null;
const elapsedEl    = document.getElementById('elapsed');
const btnStart     = document.getElementById('btn-start');
const btnLabel     = document.getElementById('btn-label');
const timerDesc    = document.getElementById('timer-desc');
const timerProject = document.getElementById('timer-project');

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

		console.log(timerDesc.value);
		send('addEntry', {
			name: timerDesc.value.trim() || 'Untitled',
			started_at:  startedAt,
			ended_at:    endedAt,
		});

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

const manualDesc  = document.getElementById('manual-desc');
const manualStart = document.getElementById('manual-start');
const manualEnd   = document.getElementById('manual-end');
const btnAdd      = document.getElementById('btn-add');

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

	send('addEntry', {
		name: desc || 'Untitled',
		project:     '',
		started_at:  s,
		ended_at:    e,
	});

	manualDesc.value = '';
	resetManualTimes();
});

function totalMs(entries) {
	return entries.reduce((sum, e) => sum + (e.ended_at - e.started_at), 0);
}

function renderEntries(entries = []) {
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
		const projectTag = e.project
			? `<span class="entry-project">${escHtml(e.project)}</span>`
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
