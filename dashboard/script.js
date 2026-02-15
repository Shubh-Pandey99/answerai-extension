const API_BASE = window.location.origin;

async function fetchSessions() {
    try {
        const res = await fetch(`${API_BASE}/api/sessions`);
        if (!res.ok) throw new Error('API down');
        const sessions = await res.json();
        renderSessions(sessions);
        updateStats(sessions);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

function renderSessions(sessions) {
    const container = document.getElementById('meetings-container');
    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div id="empty-state">No meetings recorded yet. Start a session in the AI Assistant extension!</div>';
        return;
    }

    container.innerHTML = '';
    sessions.forEach(session => {
        const card = document.createElement('div');
        card.className = 'meeting-card';
        card.innerHTML = `
            <div class="meeting-date">${new Date(session.timestamp).toLocaleString()}</div>
            <div class="meeting-title">${session.title || 'Untitled Meeting'}</div>
            <div class="meeting-snippet">${session.transcript || 'No transcript captured.'}</div>
        `;
        card.onclick = () => openModal(session);
        container.appendChild(card);
    });
}

function updateStats(sessions) {
    document.getElementById('stat-total').textContent = sessions.length;

    let totalWords = 0;
    sessions.forEach(s => {
        totalWords += (s.transcript || '').split(/\s+/).length;
    });
    document.getElementById('stat-words').textContent = totalWords.toLocaleString();

    if (sessions.length > 0) {
        const latest = new Date(sessions[0].timestamp);
        document.getElementById('stat-latest').textContent = latest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

function openModal(session) {
    const modal = document.getElementById('meeting-modal');
    document.getElementById('modal-title').textContent = session.title || 'Meeting Details';
    document.getElementById('modal-date').textContent = new Date(session.timestamp).toLocaleString();
    document.getElementById('modal-transcript').textContent = session.transcript || 'N/A';
    modal.classList.add('active');
}

document.getElementById('close-modal').onclick = () => {
    document.getElementById('meeting-modal').classList.remove('active');
};

// Close modal on outside click
window.onclick = (event) => {
    const modal = document.getElementById('meeting-modal');
    if (event.target == modal) {
        modal.classList.remove('active');
    }
};

// Initial fetch and polling
fetchSessions();
setInterval(fetchSessions, 10000); // Polling every 10s for live-ish updates
