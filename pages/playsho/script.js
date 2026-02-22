// script.js
let peerConnection, dataChannel;
let isHost = false;
let currentSession = {
    id: null,
    videoUrl: null,
    lastSync: 0,
    retryCount: 0
};

const ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ]
};

// توابع اصلی
function decodeURLParams() {
    const urlParams = new URLSearchParams(location.search);
    currentSession.id = urlParams.get('join');
    currentSession.videoUrl = decodeURIComponent(urlParams.get('video') || '');
}

function isValidVideoUrl(url) {
    try {
        new URL(url);
        return /^(https?|ftp):\/\/.+/i.test(url) && 
               /\.(mp4|webm|ogg|m3u8|mkv|avi|mov)(\?.*)?$/i.test(url);
    } catch {
        return false;
    }
}

async function initializeVideoPlayer() {
    const video = document.getElementById('videoPlayer');
    
    if (!isValidVideoUrl(currentSession.videoUrl)) {
        showStatus('لینک ویدیو نامعتبر است', 'red');
        return showSection('inputSection');
    }

    try {
        video.src = currentSession.videoUrl;
        await video.play();
        video.controls = true;
        setupVideoSync(video);
        showSection('videoSection');
        
        if (!currentSession.id) {
            createNewSession();
        } else {
            setupPeerConnection();
        }
    } catch (err) {
        console.error('خطا:', err);
        showStatus('خطا در بارگذاری ویدیو - مطمئن شوید لینک مستقیم و CORS فعال است', 'red');
        showSection('inputSection');
    }
}

function setupVideoSync(videoElement) {
    const syncEvents = ['play', 'pause', 'seeked', 'timeupdate'];
    
    syncEvents.forEach(event => {
        videoElement.addEventListener(event, () => {
            if (!isHost || !dataChannel || dataChannel.readyState !== 'open') return;
            
            const syncData = {
                type: event,
                time: videoElement.currentTime,
                timestamp: Date.now(),
                isPlaying: !videoElement.paused
            };
            
            sendSyncData(syncData);
        });
    });
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(ICE_CONFIG);

    if (isHost) {
        dataChannel = peerConnection.createDataChannel('sync');
        setupDataChannel();
    } else {
        peerConnection.ondatachannel = e => {
            dataChannel = e.channel;
            setupDataChannel();
        };
    }

    peerConnection.onicecandidate = e => {
        if (e.candidate) console.log('ICE Candidate:', e.candidate);
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        showStatus(`وضعیت اتصال: ${state}`, state === 'connected' ? 'green' : 'yellow');
        
        if (state === 'disconnected' && currentSession.retryCount < 3) {
            currentSession.retryCount++;
            setTimeout(() => window.location.reload(), 2000);
        }
    };
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        showStatus('اتصال برقرار شد!', 'green');
        if (isHost) sendSyncData('fullSync');
    };

    dataChannel.onmessage = async e => {
        try {
            const data = JSON.parse(e.data);
            await handleSyncData(data);
        } catch (err) {
            console.error('خطا در پردازش پیام:', err);
        }
    };
}

async function handleSyncData(data) {
    const video = document.getElementById('videoPlayer');
    const now = Date.now();
    
    if (now - currentSession.lastSync < 100) return;
    currentSession.lastSync = now;

    const latency = (now - data.timestamp) / 1000;
    const adjustedTime = data.time + latency;

    if (Math.abs(video.currentTime - adjustedTime) > 0.5) {
        video.currentTime = adjustedTime;
    }

    switch (data.type) {
        case 'play':
            await video.play();
            break;
        case 'pause':
            video.pause();
            break;
        case 'seek':
            video.currentTime = adjustedTime;
            break;
        case 'fullSync':
            video.currentTime = adjustedTime;
            data.isPlaying ? await video.play() : video.pause();
            break;
    }
}

// توابع کمکی
function showSection(sectionId) {
    document.querySelectorAll('[id$="Section"]').forEach(el => {
        el.classList.toggle('hidden', el.id !== sectionId);
        el.classList.toggle('fade-in', el.id === sectionId);
    });
}

function showStatus(message, color) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = message;
    statusEl.style.color = color;
}

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function createNewSession() {
    currentSession.id = generateSessionId();
    setupShareSection();
    showSection('shareSection');
    setupPeerConnection();
    isHost = true;
}

function setupShareSection() {
    const encodedUrl = encodeURIComponent(currentSession.videoUrl);
    const shareLink = `${location.origin}${location.pathname}?join=${currentSession.id}&video=${encodedUrl}`;
    
    document.getElementById('shareLink').value = shareLink;
    const shareText = `با من تماشا کن: ${currentSession.videoUrl}`;
    
    document.getElementById('whatsappShare').href = 
        `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    document.getElementById('telegramShare').href = 
        `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`;
}

// Event Handlers
window.onload = () => {
    decodeURLParams();
    if (currentSession.videoUrl) {
        initializeVideoPlayer();
    } else {
        showSection('inputSection');
    }
};

window.loadVideo = () => {
    const videoUrl = document.getElementById('videoLink').value.trim();
    if (!videoUrl) return showStatus('لینک ویدیو را وارد کنید', 'red');
    
    currentSession.videoUrl = videoUrl;
    const encodedUrl = encodeURIComponent(videoUrl);
    location.href = `${location.pathname}?video=${encodedUrl}`;
};

window.copyShareLink = () => {
    navigator.clipboard.writeText(document.getElementById('shareLink').value)
        .then(() => showStatus('لینک کپی شد!', 'green'))
        .catch(() => showStatus('خطا در کپی لینک', 'red'));
};

window.showInputSection = () => {
    history.replaceState(null, '', location.pathname);
    location.reload();
};

// تابع ارسال داده همگام‌سازی
function sendSyncData(data) {
    if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
    }
}