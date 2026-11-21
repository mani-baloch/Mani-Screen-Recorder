
function isMobile() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
}
let currentFacingMode = 'user';
const flipCamBtn = document.getElementById('flipCamBtn');
if (flipCamBtn) {
  flipCamBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    if (state.webcamStream) {
      state.webcamStream.getTracks().forEach(t => t.stop());
      state.webcamStream = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode },
        audio: false
      });
      state.webcamStream = stream;
      webcamDisplayVideo.srcObject = stream;
      fullWebcamDisplayVideo.srcObject = stream;
      await webcamDisplayVideo.play();
      await fullWebcamDisplayVideo.play();
      state.webcamVisible = true;
      switchScene(state.activeScene);
    } catch (e) {
      console.warn('Flip camera error:', e);
    }
  });
}


// ========================================================
// PWA & Service Worker Registration
// ========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}

let deferredInstallPrompt = null;
const installPwaBtn = document.getElementById('installPwaBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installPwaBtn) {
    installPwaBtn.style.display = 'inline-flex';
  }
});

if (installPwaBtn) {
  installPwaBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      installPwaBtn.style.display = 'none';
    }
    deferredInstallPrompt = null;
  });
}

window.addEventListener('appinstalled', () => {
  if (installPwaBtn) installPwaBtn.style.display = 'none';
  console.log('PWA app installed successfully!');
});

/**
 * OBS Studio Web Pro - High Performance Clean Engine
 * - Zero CPU idle, zero-lag recording
 * - Clean borderless camera with mouse wheel / button resize
 * - Single corner resize grip (no 4 handles)
 * - 1-click Solo Webcam scene
 * - Guaranteed non-black video playback
 */

// Application State
const state = {
  // Streams
  screenStream: null,
  webcamStream: null,
  micStream: null,

  // Recording State
  mediaRecorder: null,
  recordedChunks: [],
  isRecording: false,
  isPaused: false,
  isCompositorActive: false,
  recordAnimId: null,
  startTime: 0,
  pausedDuration: 0,
  pauseTimestamp: 0,
  timerInterval: null,
  recordedBlob: null,

  // Audio Context & Nodes
  audioCtx: null,
  audioDest: null,
  desktopSourceNode: null,
  desktopGainNode: null,
  desktopAnalyser: null,
  desktopMuted: false,

  micSourceNode: null,
  micGainNode: null,
  micAnalyser: null,
  micMuted: false,

  // Active Scene: 'screen-cam' | 'cam-only' | 'screen-only'
  activeScene: 'screen-cam',

  // Visibility Flags
  screenVisible: true,
  webcamVisible: false,
  micVisible: true,

  // Settings
  resolution: '720p',
  fps: 30,
  format: 'video/webm;codecs=vp9,opus',
  selectedCamDeviceId: '',

  // Cached Camera Position & Aspect Ratio (Prevents layout thrashing)
  camBounds: {
    relX: 0.70,
    relY: 0.68,
    relW: 0.26,
    aspect: 16 / 9.5
  },

  // Drag & Corner Grip State
  dragState: {
    isDragging: false,
    startX: 0,
    startY: 0,
    boxLeft: 0,
    boxTop: 0
  },
  gripResizeState: {
    isResizing: false,
    startX: 0,
    startY: 0,
    startW: 0
  }
};

// DOM Elements
const canvasContainer = document.getElementById('canvasContainer');
const monitorStage = document.getElementById('monitorStage');
const screenDisplayVideo = document.getElementById('screenDisplayVideo');
const fullWebcamDisplayVideo = document.getElementById('fullWebcamDisplayVideo');
const webcamBox = document.getElementById('webcamBox');
const webcamDisplayVideo = document.getElementById('webcamDisplayVideo');
const singleResizeGrip = document.getElementById('singleResizeGrip');
const recordCanvas = document.getElementById('recordCanvas');
const recordCtx = recordCanvas.getContext('2d', { alpha: false });
const canvasEmptyState = document.getElementById('canvasEmptyState');
const sceneIndicatorLabel = document.getElementById('sceneIndicatorLabel');

// Header & Scene Switching Pills
const pillScreenCam = document.getElementById('pillScreenCam');
const pillFullCam = document.getElementById('pillFullCam');
const pillFullScreen = document.getElementById('pillFullScreen');
const quickCamSelect = document.getElementById('quickCamSelect');
const canvasResTag = document.getElementById('canvasResTag');
const statusCamInfo = document.getElementById('statusCamInfo');

// Quick Camera Resize Buttons
const camShrinkBtn = document.getElementById('camShrinkBtn');
const camEnlargeBtn = document.getElementById('camEnlargeBtn');
const resetCamPosBtn = document.getElementById('resetCamPosBtn');
const wbShrink = document.getElementById('wbShrink');
const wbEnlarge = document.getElementById('wbEnlarge');

// Scenes & Sources
const scenesList = document.getElementById('scenesList');
const screenStatusBadge = document.getElementById('screenStatusBadge');
const camStatusBadge = document.getElementById('camStatusBadge');
const micStatusBadge = document.getElementById('micStatusBadge');
const activeSourcesCount = document.getElementById('activeSourcesCount');
const toggleScreenVis = document.getElementById('toggleScreenVis');
const toggleCamVis = document.getElementById('toggleCamVis');
const toggleMicVis = document.getElementById('toggleMicVis');
const quickAddScreenBtn = document.getElementById('quickAddScreenBtn');
const quickAddCamBtn = document.getElementById('quickAddCamBtn');

// Audio Mixer
const desktopMeterBar = document.getElementById('desktopMeterBar');
const desktopDbLabel = document.getElementById('desktopDbLabel');
const desktopVolumeFader = document.getElementById('desktopVolumeFader');
const muteDesktopBtn = document.getElementById('muteDesktopBtn');

const micMeterBar = document.getElementById('micMeterBar');
const micDbLabel = document.getElementById('micDbLabel');
const micVolumeFader = document.getElementById('micVolumeFader');
const muteMicBtn = document.getElementById('muteMicBtn');

// Controls
const startRecBtn = document.getElementById('startRecBtn');
const startRecLabel = document.getElementById('startRecLabel');
const pauseRecBtn = document.getElementById('pauseRecBtn');
const pauseRecLabel = document.getElementById('pauseRecLabel');
const toggleScreenBtn = document.getElementById('toggleScreenBtn');
const toggleWebcamBtn = document.getElementById('toggleWebcamBtn');
const openSettingsModalBtn = document.getElementById('openSettingsModalBtn');
const resetAllBtn = document.getElementById('resetAllBtn');

const emptySelectScreenBtn = document.getElementById('emptySelectScreenBtn');
const emptyStartCamBtn = document.getElementById('emptyStartCamBtn');

// Status Bar
const statusRecIndicator = document.getElementById('statusRecIndicator');
const statusRecText = document.getElementById('statusRecText');
const statusFps = document.getElementById('statusFps');
const statusFormat = document.getElementById('statusFormat');

// Countdown Overlay
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNum = document.getElementById('countdownNum');

// Modals
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const modalResolution = document.getElementById('modalResolution');
const modalFps = document.getElementById('modalFps');
const modalFormat = document.getElementById('modalFormat');
const modalCameraSelect = document.getElementById('modalCameraSelect');

const previewModal = document.getElementById('previewModal');
const closePreviewModal = document.getElementById('closePreviewModal');
const finishedVideoPlayer = document.getElementById('finishedVideoPlayer');
const modalDuration = document.getElementById('modalDuration');
const modalSize = document.getElementById('modalSize');
const modalType = document.getElementById('modalType');
const modalFileName = document.getElementById('modalFileName');
const modalDownloadBtn = document.getElementById('modalDownloadBtn');
const modalCloseAndNewBtn = document.getElementById('modalCloseAndNewBtn');

// ========================================================
// 1. Scene Switching Engine
// ========================================================
function switchScene(sceneName) {
  state.activeScene = sceneName;

  [pillScreenCam, pillFullCam, pillFullScreen].forEach(p => p.classList.remove('active'));
  if (sceneName === 'screen-cam') pillScreenCam.classList.add('active');
  else if (sceneName === 'cam-only') pillFullCam.classList.add('active');
  else if (sceneName === 'screen-only') pillFullScreen.classList.add('active');

  document.querySelectorAll('#scenesList .obs-list-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-scene') === sceneName);
  });

  if (sceneName === 'screen-cam') {
    sceneIndicatorLabel.textContent = 'Screen + Facecam';
    screenDisplayVideo.style.display = state.screenStream ? 'block' : 'none';
    fullWebcamDisplayVideo.style.display = 'none';
    if (state.webcamStream) {
      webcamBox.style.display = 'block';
      setTimeout(updateCachedCamBounds, 50);
    }
  } else if (sceneName === 'cam-only') {
    sceneIndicatorLabel.textContent = 'Full Webcam (Solo)';
    screenDisplayVideo.style.display = 'none';
    webcamBox.style.display = 'none';
    if (state.webcamStream) {
      fullWebcamDisplayVideo.style.display = 'block';
    } else {
      startWebcam().then(() => {
        fullWebcamDisplayVideo.style.display = 'block';
      });
    }
  } else if (sceneName === 'screen-only') {
    sceneIndicatorLabel.textContent = 'Screen Only';
    screenDisplayVideo.style.display = state.screenStream ? 'block' : 'none';
    fullWebcamDisplayVideo.style.display = 'none';
    webcamBox.style.display = 'none';
  }

  updateEmptyState();
}

pillScreenCam.addEventListener('click', () => switchScene('screen-cam'));
pillFullCam.addEventListener('click', () => switchScene('cam-only'));
pillFullScreen.addEventListener('click', () => switchScene('screen-only'));

scenesList.addEventListener('click', (e) => {
  const item = e.target.closest('.obs-list-item');
  if (!item) return;
  switchScene(item.getAttribute('data-scene'));
});

// ========================================================
// 2. Camera Resize & Dragging (Widescreen Guarantee)
// ========================================================
function updateCachedCamBounds() {
  try {
    const parent = monitorStage || canvasContainer;
    const parentRect = parent.getBoundingClientRect();
    const boxRect = webcamBox.getBoundingClientRect();

    if (!boxRect || boxRect.width < 40 || boxRect.height < 25) {
      return;
    }

    if (parentRect && parentRect.width > 50 && parentRect.height > 50) {
      const boxAspect = boxRect.width / boxRect.height;
      state.camBounds.relX = (boxRect.left - parentRect.left) / parentRect.width;
      state.camBounds.relY = (boxRect.top - parentRect.top) / parentRect.height;
      state.camBounds.relW = boxRect.width / parentRect.width;
      state.camBounds.aspect = (boxAspect > 0.5 && boxAspect < 3) ? boxAspect : (16 / 9.5);
    }
  } catch (e) {
    console.warn('Bounds update error:', e);
  }
}

function resizeCameraBox(deltaPx) {
  const parent = monitorStage || canvasContainer;
  const parentRect = parent.getBoundingClientRect();
  const curW = webcamBox.offsetWidth;
  const widescreenRatio = 16 / 9.5;

  const minW = Math.max(120, Math.round(parentRect.width * 0.15));
  const maxW = Math.round(parentRect.width * 0.70);

  let newW = Math.max(minW, Math.min(maxW, curW + deltaPx));
  let newH = Math.round(newW / widescreenRatio);

  webcamBox.style.width = `${newW}px`;
  webcamBox.style.height = `${newH}px`;

  const rect = webcamBox.getBoundingClientRect();
  if (rect.right > parentRect.right) {
    webcamBox.style.left = `${parentRect.width - newW - 8}px`;
  }
  if (rect.bottom > parentRect.bottom) {
    webcamBox.style.top = `${parentRect.height - newH - 8}px`;
  }

  updateCachedCamBounds();
}

webcamBox.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 25 : -25;
  resizeCameraBox(delta);
}, { passive: false });

camShrinkBtn.addEventListener('click', () => resizeCameraBox(-35));
camEnlargeBtn.addEventListener('click', () => resizeCameraBox(35));
wbShrink.addEventListener('click', (e) => { e.stopPropagation(); resizeCameraBox(-35); });
wbEnlarge.addEventListener('click', (e) => { e.stopPropagation(); resizeCameraBox(35); });

resetCamPosBtn.addEventListener('click', () => {
  const parent = monitorStage || canvasContainer;
  const stageW = parent.clientWidth || 640;
  const defW = Math.max(150, Math.min(280, Math.round(stageW * 0.28)));
  const defH = Math.round(defW / (16 / 9.5));
  webcamBox.style.width = `${defW}px`;
  webcamBox.style.height = `${defH}px`;
  webcamBox.style.left = 'auto';
  webcamBox.style.top = 'auto';
  webcamBox.style.right = '16px';
  webcamBox.style.bottom = '16px';
  updateCachedCamBounds();
});


// ========================================================
// Mobile Touch Drag & Resize Handlers
// ========================================================
webcamBox.addEventListener('touchstart', (e) => {
  if (e.target.closest('.webcam-size-btn') || e.target === singleResizeGrip) return;
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  const rect = webcamBox.getBoundingClientRect();
  const parent = monitorStage || canvasContainer;
  const parentRect = parent.getBoundingClientRect();

  state.dragState.isDragging = true;
  state.dragState.startX = touch.clientX;
  state.dragState.startY = touch.clientY;
  state.dragState.boxLeft = rect.left - parentRect.left;
  state.dragState.boxTop = rect.top - parentRect.top;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!state.dragState.isDragging && !state.gripResizeState.isResizing) return;
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  const parent = monitorStage || canvasContainer;
  const parentRect = parent.getBoundingClientRect();

  if (state.gripResizeState.isResizing) {
    const dx = touch.clientX - state.gripResizeState.startX;
    const widescreenRatio = 16 / 9.5;
    const minW = Math.max(100, Math.round(parentRect.width * 0.15));
    const maxW = Math.round(parentRect.width * 0.70);
    const newW = Math.max(minW, Math.min(maxW, state.gripResizeState.startW + dx));
    const newH = Math.round(newW / widescreenRatio);

    webcamBox.style.width = `${newW}px`;
    webcamBox.style.height = `${newH}px`;
    webcamBox.style.right = 'auto';
    webcamBox.style.bottom = 'auto';
    updateCachedCamBounds();
    return;
  }

  if (state.dragState.isDragging) {
    const dx = touch.clientX - state.dragState.startX;
    const dy = touch.clientY - state.dragState.startY;

    const boxW = webcamBox.offsetWidth;
    const boxH = webcamBox.offsetHeight;

    let nx = state.dragState.boxLeft + dx;
    let ny = state.dragState.boxTop + dy;

    nx = Math.max(0, Math.min(parentRect.width - boxW, nx));
    ny = Math.max(0, Math.min(parentRect.height - boxH, ny));

    webcamBox.style.left = `${nx}px`;
    webcamBox.style.top = `${ny}px`;
    webcamBox.style.right = 'auto';
    webcamBox.style.bottom = 'auto';
    updateCachedCamBounds();
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  if (state.dragState.isDragging || state.gripResizeState.isResizing) {
    state.dragState.isDragging = false;
    state.gripResizeState.isResizing = false;
    updateCachedCamBounds();
  }
});

singleResizeGrip.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  state.gripResizeState.isResizing = true;
  state.gripResizeState.startX = touch.clientX;
  state.gripResizeState.startW = webcamBox.offsetWidth;
}, { passive: true });

singleResizeGrip.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  state.gripResizeState.isResizing = true;
  state.gripResizeState.startX = e.clientX;
  state.gripResizeState.startW = webcamBox.offsetWidth;
});

webcamBox.addEventListener('mousedown', (e) => {
  if (e.target.closest('.webcam-size-btn') || e.target === singleResizeGrip) return;

  const rect = webcamBox.getBoundingClientRect();
  const parent = monitorStage || canvasContainer;
  const parentRect = parent.getBoundingClientRect();

  state.dragState.isDragging = true;
  state.dragState.startX = e.clientX;
  state.dragState.startY = e.clientY;
  state.dragState.boxLeft = rect.left - parentRect.left;
  state.dragState.boxTop = rect.top - parentRect.top;

  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  const parent = monitorStage || canvasContainer;
  const parentRect = parent.getBoundingClientRect();

  if (state.gripResizeState.isResizing) {
    const dx = e.clientX - state.gripResizeState.startX;
    const widescreenRatio = 16 / 9.5;
    const newW = Math.max(160, Math.min(parentRect.width * 0.75, state.gripResizeState.startW + dx));
    const newH = Math.round(newW / widescreenRatio);

    webcamBox.style.width = `${newW}px`;
    webcamBox.style.height = `${newH}px`;
    webcamBox.style.right = 'auto';
    webcamBox.style.bottom = 'auto';
    updateCachedCamBounds();
    return;
  }

  if (state.dragState.isDragging) {
    const dx = e.clientX - state.dragState.startX;
    const dy = e.clientY - state.dragState.startY;

    const boxW = webcamBox.offsetWidth;
    const boxH = webcamBox.offsetHeight;

    let nx = state.dragState.boxLeft + dx;
    let ny = state.dragState.boxTop + dy;

    nx = Math.max(0, Math.min(parentRect.width - boxW, nx));
    ny = Math.max(0, Math.min(parentRect.height - boxH, ny));

    webcamBox.style.left = `${nx}px`;
    webcamBox.style.top = `${ny}px`;
    webcamBox.style.right = 'auto';
    webcamBox.style.bottom = 'auto';
    updateCachedCamBounds();
  }
});

window.addEventListener('mouseup', () => {
  if (state.dragState.isDragging || state.gripResizeState.isResizing) {
    state.dragState.isDragging = false;
    state.gripResizeState.isResizing = false;
    updateCachedCamBounds();
  }
});

// ========================================================
// 3. Audio Setup (Lightweight)
// ========================================================
function ensureAudioContext() {
  if (!state.audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContextClass();
    state.audioDest = state.audioCtx.createMediaStreamDestination();
  }
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
}

function setupDesktopAudio(stream) {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;

  ensureAudioContext();

  if (state.desktopSourceNode) {
    try { state.desktopSourceNode.disconnect(); } catch (e) { }
  }

  state.desktopSourceNode = state.audioCtx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
  state.desktopGainNode = state.audioCtx.createGain();
  state.desktopAnalyser = state.audioCtx.createAnalyser();
  state.desktopAnalyser.fftSize = 32;

  state.desktopGainNode.gain.value = parseFloat(desktopVolumeFader.value);

  state.desktopSourceNode.connect(state.desktopGainNode);
  state.desktopGainNode.connect(state.desktopAnalyser);
  state.desktopGainNode.connect(state.audioDest);
}

async function setupMicAudio(deviceId = null) {
  try {
    ensureAudioContext();

    if (state.micStream) {
      state.micStream.getTracks().forEach(t => t.stop());
    }

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };

    try {
      state.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (errConstraint) {
      state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (state.micSourceNode) {
      try { state.micSourceNode.disconnect(); } catch (e) { }
    }

    state.micSourceNode = state.audioCtx.createMediaStreamSource(state.micStream);
    state.micGainNode = state.audioCtx.createGain();
    state.micAnalyser = state.audioCtx.createAnalyser();
    state.micAnalyser.fftSize = 32;

    state.micGainNode.gain.value = parseFloat(micVolumeFader.value);

    state.micSourceNode.connect(state.micGainNode);
    state.micGainNode.connect(state.micAnalyser);
    state.micGainNode.connect(state.audioDest);

    micStatusBadge.textContent = 'Active';
    micStatusBadge.className = 'source-status-badge on';
  } catch (err) {
    console.warn('Mic error:', err);
    micStatusBadge.textContent = 'Off';
    micStatusBadge.className = 'source-status-badge';
  }
}

setInterval(() => {
  if (state.desktopAnalyser && !state.desktopMuted) {
    const data = new Uint8Array(state.desktopAnalyser.frequencyBinCount);
    state.desktopAnalyser.getByteFrequencyData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
    const pct = Math.min(100, Math.round((max / 255) * 100));
    desktopMeterBar.style.width = `${pct}%`;
    desktopDbLabel.textContent = max > 0 ? `${(20 * Math.log10(max / 255)).toFixed(1)} dB` : '-inf dB';
  } else {
    desktopMeterBar.style.width = '0%';
    desktopDbLabel.textContent = state.desktopMuted ? 'MUTED' : '-inf dB';
  }

  if (state.micAnalyser && !state.micMuted && state.micVisible) {
    const data = new Uint8Array(state.micAnalyser.frequencyBinCount);
    state.micAnalyser.getByteFrequencyData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
    const pct = Math.min(100, Math.round((max / 255) * 100));
    micMeterBar.style.width = `${pct}%`;
    micDbLabel.textContent = max > 0 ? `${(20 * Math.log10(max / 255)).toFixed(1)} dB` : '-inf dB';
  } else {
    micMeterBar.style.width = '0%';
    micDbLabel.textContent = state.micMuted ? 'MUTED' : '-inf dB';
  }
}, 80);

desktopVolumeFader.addEventListener('input', (e) => {
  if (state.desktopGainNode) state.desktopGainNode.gain.value = parseFloat(e.target.value);
});
micVolumeFader.addEventListener('input', (e) => {
  if (state.micGainNode) state.micGainNode.gain.value = parseFloat(e.target.value);
});

muteDesktopBtn.addEventListener('click', () => {
  state.desktopMuted = !state.desktopMuted;
  if (state.desktopGainNode) state.desktopGainNode.gain.value = state.desktopMuted ? 0 : parseFloat(desktopVolumeFader.value);
  muteDesktopBtn.classList.toggle('muted', state.desktopMuted);
  muteDesktopBtn.textContent = state.desktopMuted ? '🔇' : '🔊';
});

muteMicBtn.addEventListener('click', () => {
  state.micMuted = !state.micMuted;
  if (state.micGainNode) state.micGainNode.gain.value = state.micMuted ? 0 : parseFloat(micVolumeFader.value);
  muteMicBtn.classList.toggle('muted', state.micMuted);
  muteMicBtn.textContent = state.micMuted ? '🔇' : '🎙️';
});

// ========================================================
// 4. Camera Discovery Engine
// ========================================================
async function discoverCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    quickCamSelect.innerHTML = '';
    modalCameraSelect.innerHTML = '';

    if (videoDevices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No Camera Detected';
      quickCamSelect.appendChild(opt);
      return;
    }

    let integratedId = '';
    let integratedLabel = '';

    videoDevices.forEach((d, idx) => {
      const label = d.label || `Camera ${idx + 1}`;
      const opt1 = document.createElement('option');
      opt1.value = d.deviceId;
      opt1.textContent = label;

      const opt2 = document.createElement('option');
      opt2.value = d.deviceId;
      opt2.textContent = label;

      const isIntegrated = label.toLowerCase().includes('integrated') ||
        label.toLowerCase().includes('internal') ||
        label.toLowerCase().includes('built-in');
      const isVirtual = label.toLowerCase().includes('iriun') || label.toLowerCase().includes('obs');

      if ((isIntegrated && !isVirtual) || (!integratedId && !isVirtual)) {
        integratedId = d.deviceId;
        integratedLabel = label;
      }

      quickCamSelect.appendChild(opt1);
      modalCameraSelect.appendChild(opt2);
    });

    if (!integratedId && videoDevices.length > 0) {
      integratedId = videoDevices[0].deviceId;
      integratedLabel = videoDevices[0].label || 'Default Camera';
    }

    if (!state.selectedCamDeviceId) {
      state.selectedCamDeviceId = integratedId;
    }

    quickCamSelect.value = state.selectedCamDeviceId;
    modalCameraSelect.value = state.selectedCamDeviceId;
    statusCamInfo.textContent = `Cam: ${integratedLabel || 'Ready'}`;
  } catch (e) {
    console.warn('Camera discovery error:', e);
  }
}

quickCamSelect.addEventListener('change', async (e) => {
  const chosenId = e.target.value;
  if (!chosenId) return;
  state.selectedCamDeviceId = chosenId;
  modalCameraSelect.value = chosenId;
  statusCamInfo.textContent = `Cam: ${quickCamSelect.options[quickCamSelect.selectedIndex].text}`;

  if (state.webcamStream) {
    await startWebcam(chosenId);
  }
});

async function startWebcam(deviceId = null) {
  ensureAudioContext();
  const targetId = deviceId || state.selectedCamDeviceId || quickCamSelect.value;

  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(t => t.stop());
    state.webcamStream = null;
  }

  let stream = null;
  try {
    const videoConstraints = targetId ? { deviceId: { exact: targetId } } : true;
    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
  } catch (err1) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (err2) {
      alert('Camera access failed. Please verify permission in browser address bar.');
      return false;
    }
  }

  state.webcamStream = stream;
  webcamDisplayVideo.srcObject = stream;
  fullWebcamDisplayVideo.srcObject = stream;

  try {
    await webcamDisplayVideo.play();
    await fullWebcamDisplayVideo.play();
  } catch (e) { }

  await discoverCameras();

  state.webcamVisible = true;
  toggleCamVis.classList.remove('hidden');
  camStatusBadge.textContent = 'Active';
  camStatusBadge.className = 'source-status-badge on';
  toggleWebcamBtn.textContent = 'Facecam Off';
  toggleWebcamBtn.style.color = '#ef4444';

  switchScene(state.activeScene);
  setTimeout(updateCachedCamBounds, 100);
  return true;
}

function stopWebcam() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(t => t.stop());
    state.webcamStream = null;
  }
  webcamDisplayVideo.srcObject = null;
  fullWebcamDisplayVideo.srcObject = null;
  webcamBox.style.display = 'none';
  fullWebcamDisplayVideo.style.display = 'none';
  state.webcamVisible = false;

  camStatusBadge.textContent = 'Off';
  camStatusBadge.className = 'source-status-badge';
  toggleWebcamBtn.textContent = 'Facecam On';
  toggleWebcamBtn.style.color = '';
  updateEmptyState();
}

// ========================================================
// 5. Screen Capture Engine
// ========================================================
async function selectScreen() {
  ensureAudioContext();

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    alert("Mobile Browser: Mobile OS security policies doosri apps ki screen capture restrict karti hain. Aapka Camera & Mic recording mode on kar diya gaya hai!");
    switchScene('cam-only');
    if (!state.webcamStream) await startWebcam();
    return;
  }

  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => t.stop());
  }

  let stream = null;
  try {
    const idealWidth = state.resolution === '720p' ? 1280 : 1920;
    const idealHeight = state.resolution === '720p' ? 720 : 1080;
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        frameRate: { ideal: state.fps, max: state.fps },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight }
      },
      audio: true
    });
  } catch (errDesktop) {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (errMobile) {
      if (errMobile.name === 'NotAllowedError') return;
      alert("Mobile Browser: Screen capture allow nahi hai. Camera & Mic mode on kiya ja raha hai!");
      switchScene('cam-only');
      if (!state.webcamStream) await startWebcam();
      return;
    }
  }

  if (!stream) return;

  try {
    state.screenStream = stream;
    screenDisplayVideo.srcObject = state.screenStream;
    await screenDisplayVideo.play();

    const screenTrack = state.screenStream.getVideoTracks()[0];
    const settings = screenTrack.getSettings ? screenTrack.getSettings() : {};
    if (settings.width && settings.height) {
      state.screenAspect = settings.width / settings.height;
      if (monitorStage) monitorStage.style.aspectRatio = `${settings.width} / ${settings.height}`;
    }

    setupDesktopAudio(state.screenStream);

    state.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreen();
      if (state.isRecording) stopRecording();
    });

    state.screenVisible = true;
    screenStatusBadge.textContent = 'Active';
    screenStatusBadge.className = 'source-status-badge on';
    toggleScreenBtn.textContent = 'Change Screen';

    switchScene(state.activeScene);
    setTimeout(updateCachedCamBounds, 100);
  } catch (err) {
    console.warn('Screen setup error:', err);
  }
}

function stopScreen() {
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => t.stop());
    state.screenStream = null;
  }
  screenDisplayVideo.srcObject = null;
  screenDisplayVideo.style.display = 'none';
  screenStatusBadge.textContent = 'Off';
  screenStatusBadge.className = 'source-status-badge';
  toggleScreenBtn.textContent = 'Select Screen';
  updateEmptyState();
}

function updateEmptyState() {
  let count = 0;
  if (state.screenStream) count++;
  if (state.webcamStream) count++;
  if (state.micStream) count++;
  activeSourcesCount.textContent = `${count} Active`;

  const hasAnyVisual = (state.screenStream && (state.activeScene === 'screen-cam' || state.activeScene === 'screen-only')) ||
    (state.webcamStream && (state.activeScene === 'cam-only' || state.activeScene === 'screen-cam'));

  canvasEmptyState.style.display = hasAnyVisual ? 'none' : 'flex';
}

// ========================================================
// 6. OBJECT-FIT: COVER VIDEO DRAWING (100% ERROR-PROOF)
// ========================================================
function drawVideoCover(ctx, video, destX, destY, destW, destH, mirror = true) {
  if (!video || video.readyState < 2) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !destW || !destH) return;
  if (isNaN(destX) || isNaN(destY) || isNaN(destW) || isNaN(destH)) return;

  const videoAspect = vw / vh;
  const destAspect = destW / destH;

  let sx = 0, sy = 0, sw = vw, sh = vh;

  if (destAspect > videoAspect) {
    sh = Math.round(vw / destAspect);
    sy = Math.round((vh - sh) / 2);
  } else {
    sw = Math.round(vh * destAspect);
    sx = Math.round((vw - sw) / 2);
  }

  sw = Math.max(1, Math.min(vw, sw));
  sh = Math.max(1, Math.min(vh, sh));
  sx = Math.max(0, Math.min(vw - sw, sx));
  sy = Math.max(0, Math.min(vh - sh, sy));

  ctx.save();
  if (mirror) {
    ctx.translate(destX + destW, destY);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, destW, destH);
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, destX, destY, destW, destH);
  }
  ctx.restore();
}

// ========================================================
// 7. RECORDING ENGINE (GUARANTEED WORKING & NON-BLACK)
// ========================================================
async function startRecording() {
  ensureAudioContext();

  if (!state.screenStream && !state.webcamStream) {
    if (isMobile()) {
      switchScene('cam-only');
      const camOk = await startWebcam();
      if (!camOk && !state.webcamStream) {
        alert("Mobile recording ke liye camera allow karein!");
        return;
      }
    } else {
      await selectScreen();
      if (!state.screenStream && !state.webcamStream) {
        const camOk = await startWebcam();
        if (!camOk) return;
      }
    }
  }

  if (!state.micStream) {
    await setupMicAudio();
  }

  await runCountdown();

  let finalVideoStream = null;

  if (state.activeScene === 'screen-only' && state.screenStream) {
    finalVideoStream = state.screenStream;
  } else if (state.activeScene === 'cam-only' && state.webcamStream) {
    finalVideoStream = state.webcamStream;
  } else if (state.screenStream) {
    updateCachedCamBounds();
    finalVideoStream = startOptimizedCompositor();
  } else if (state.webcamStream) {
    finalVideoStream = state.webcamStream;
  } else {
    finalVideoStream = startOptimizedCompositor();
  }

  const finalTracks = [...finalVideoStream.getVideoTracks()];
  if (state.audioDest && state.audioDest.stream.getAudioTracks().length > 0) {
    finalTracks.push(state.audioDest.stream.getAudioTracks()[0]);
  }
  const streamToRecord = new MediaStream(finalTracks);

  const formatMimes = [
    state.format,
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4'
  ];

  let chosenMime = '';
  for (const m of formatMimes) {
    if (m && MediaRecorder.isTypeSupported(m)) {
      chosenMime = m;
      break;
    }
  }

  const options = {
    mimeType: chosenMime || undefined,
    videoBitsPerSecond: 3500000
  };

  state.recordedChunks = [];
  state.mediaRecorder = new MediaRecorder(streamToRecord, options);

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      state.recordedChunks.push(e.data);
    }
  };

  state.mediaRecorder.onstop = () => {
    stopOptimizedCompositor();
    onRecordingStopped(chosenMime || 'video/webm');
  };

  state.isRecording = true;
  state.isPaused = false;
  state.startTime = Date.now();
  state.pausedDuration = 0;
  startTimer();

  state.mediaRecorder.start(1000);

  startRecBtn.classList.add('recording');
  startRecLabel.textContent = 'Stop Recording';
  pauseRecBtn.style.display = 'inline-flex';
  statusRecIndicator.classList.add('recording');
}

function startOptimizedCompositor() {
  const aspect = state.screenAspect || (16 / 9);
  const cw = state.resolution === '1080p' ? 1920 : 1280;
  const ch = Math.round(cw / aspect);
  recordCanvas.width = cw;
  recordCanvas.height = ch;

  state.isCompositorActive = true;

  if (screenDisplayVideo && screenDisplayVideo.paused) {
    screenDisplayVideo.play().catch(() => { });
  }
  if (webcamDisplayVideo && webcamDisplayVideo.paused) {
    webcamDisplayVideo.play().catch(() => { });
  }

  drawSingleCompositorFrame(cw, ch);

  let lastTime = performance.now();
  const frameInterval = 1000 / state.fps;

  function loop(now) {
    if (!state.isCompositorActive) return;

    if (now - lastTime >= frameInterval) {
      lastTime = now;
      drawSingleCompositorFrame(cw, ch);
    }

    state.recordAnimId = requestAnimationFrame(loop);
  }

  state.recordAnimId = requestAnimationFrame(loop);
  return recordCanvas.captureStream(state.fps);
}

function drawSingleCompositorFrame(cw, ch) {
  try {
    const scene = state.activeScene;

    // 1. Solo Webcam Mode
    if (scene === 'cam-only') {
      if (fullWebcamDisplayVideo && fullWebcamDisplayVideo.readyState >= 2) {
        drawVideoCover(recordCtx, fullWebcamDisplayVideo, 0, 0, cw, ch, true);
        return;
      }
    }

    // 2. Base Screen Layer
    if (screenDisplayVideo && screenDisplayVideo.readyState >= 2 && state.screenVisible) {
      recordCtx.drawImage(screenDisplayVideo, 0, 0, cw, ch);
    } else {
      recordCtx.fillStyle = '#0f111a';
      recordCtx.fillRect(0, 0, cw, ch);
    }

    // 3. Facecam Overlay (Guaranteed Widescreen Rectangle, No Square bug!)
    if (scene === 'screen-cam' && state.webcamStream && state.webcamVisible) {
      if (webcamDisplayVideo && webcamDisplayVideo.readyState >= 2) {
        const { relX, relY, relW, aspect } = state.camBounds;

        const boxAspect = (aspect && !isNaN(aspect) && aspect > 0) ? aspect : (16 / 9.5);
        const validRelW = (relW && !isNaN(relW) && relW > 0.05) ? relW : 0.26;
        const validRelX = (!isNaN(relX)) ? relX : 0.70;
        const validRelY = (!isNaN(relY)) ? relY : 0.68;

        const camW = Math.max(120, Math.round(validRelW * cw));
        const camH = Math.max(75, Math.round(camW / boxAspect));

        let camX = Math.round(validRelX * cw);
        let camY = Math.round(validRelY * ch);

        camX = Math.max(8, Math.min(cw - camW - 8, camX));
        camY = Math.max(8, Math.min(ch - camH - 8, camY));

        recordCtx.save();
        if (typeof recordCtx.roundRect === 'function') {
          recordCtx.beginPath();
          recordCtx.roundRect(camX, camY, camW, camH, 12);
          recordCtx.clip();
        }
        drawVideoCover(recordCtx, webcamDisplayVideo, camX, camY, camW, camH, true);
        recordCtx.restore();

        recordCtx.save();
        recordCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        recordCtx.lineWidth = 2;
        if (typeof recordCtx.roundRect === 'function') {
          recordCtx.beginPath();
          recordCtx.roundRect(camX, camY, camW, camH, 12);
          recordCtx.stroke();
        } else {
          recordCtx.strokeRect(camX, camY, camW, camH);
        }
        recordCtx.restore();
      }
    }
  } catch (err) {
    console.error('Compositor frame render error:', err);
  }
}

function stopOptimizedCompositor() {
  state.isCompositorActive = false;
  if (state.recordAnimId) {
    cancelAnimationFrame(state.recordAnimId);
    state.recordAnimId = null;
  }
}

function pauseRecording() {
  if (!state.isRecording || !state.mediaRecorder) return;

  if (state.isPaused) {
    state.mediaRecorder.resume();
    state.isPaused = false;
    state.pausedDuration += Date.now() - state.pauseTimestamp;
    pauseRecLabel.textContent = 'Pause';
    statusRecIndicator.classList.add('recording');
  } else {
    state.mediaRecorder.pause();
    state.isPaused = true;
    state.pauseTimestamp = Date.now();
    pauseRecLabel.textContent = 'Resume';
    statusRecIndicator.classList.remove('recording');
  }
}

function stopRecording() {
  if (!state.isRecording) return;
  state.isRecording = false;
  state.isPaused = false;
  clearInterval(state.timerInterval);

  stopOptimizedCompositor();

  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }

  startRecBtn.classList.remove('recording');
  startRecLabel.textContent = 'Start Recording';
  pauseRecBtn.style.display = 'none';
  statusRecIndicator.classList.remove('recording');
}

function onRecordingStopped(mime) {
  state.recordedBlob = new Blob(state.recordedChunks, { type: mime });

  const url = URL.createObjectURL(state.recordedBlob);
  finishedVideoPlayer.src = url;

  modalDuration.textContent = statusRecText.textContent.replace('REC: ', '');
  const sizeMb = (state.recordedBlob.size / (1024 * 1024)).toFixed(2);
  modalSize.textContent = sizeMb + ' MB';
  modalType.textContent = mime.includes('mp4') ? 'MP4 Video' : 'WebM Video (HD)';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');
  modalFileName.value = 'Screen_Recording_' + dateStr + '_' + timeStr;

  previewModal.style.display = 'flex';
}

function runCountdown() {
  return new Promise((resolve) => {
    countdownOverlay.style.display = 'flex';
    let count = 3;
    countdownNum.textContent = count;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNum.textContent = count;
      } else {
        clearInterval(interval);
        countdownOverlay.style.display = 'none';
        resolve();
      }
    }, 900);
  });
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.isPaused) return;
    const elapsed = Date.now() - state.startTime - state.pausedDuration;
    statusRecText.textContent = 'REC: ' + formatDuration(elapsed);
  }, 250);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

// Download Button in Preview Modal
modalDownloadBtn.addEventListener('click', () => {
  if (!state.recordedBlob) return;
  const mime = state.recordedBlob.type || '';
  const ext = mime.includes('mp4') ? '.mp4' : '.webm';
  let name = modalFileName.value.trim() || 'Screen_Recording';
  if (!name.endsWith(ext)) name += ext;

  const url = URL.createObjectURL(state.recordedBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
});

modalCloseAndNewBtn.addEventListener('click', () => {
  finishedVideoPlayer.pause();
  finishedVideoPlayer.src = '';
  previewModal.style.display = 'none';
  statusRecText.textContent = 'REC: 00:00:00';
});

closePreviewModal.addEventListener('click', () => {
  previewModal.style.display = 'none';
});

// UI Event Listeners
startRecBtn.addEventListener('click', () => {
  if (state.isRecording) stopRecording();
  else startRecording();
});

pauseRecBtn.addEventListener('click', pauseRecording);

toggleScreenBtn.addEventListener('click', selectScreen);
emptySelectScreenBtn.addEventListener('click', selectScreen);
quickAddScreenBtn.addEventListener('click', selectScreen);

async function handleCamToggle() {
  if (state.webcamStream) stopWebcam();
  else await startWebcam(state.selectedCamDeviceId);
}
toggleWebcamBtn.addEventListener('click', handleCamToggle);
emptyStartCamBtn.addEventListener('click', handleCamToggle);
quickAddCamBtn.addEventListener('click', handleCamToggle);

toggleScreenVis.addEventListener('click', () => {
  state.screenVisible = !state.screenVisible;
  screenDisplayVideo.style.display = state.screenVisible ? 'block' : 'none';
  toggleScreenVis.classList.toggle('hidden', !state.screenVisible);
});

toggleCamVis.addEventListener('click', () => {
  state.webcamVisible = !state.webcamVisible;
  webcamBox.style.display = state.webcamVisible ? 'block' : 'none';
  toggleCamVis.classList.toggle('hidden', !state.webcamVisible);
});

toggleMicVis.addEventListener('click', () => {
  state.micVisible = !state.micVisible;
  toggleMicVis.classList.toggle('hidden', !state.micVisible);
  if (state.micGainNode) {
    state.micGainNode.gain.value = state.micVisible && !state.micMuted ? parseFloat(micVolumeFader.value) : 0;
  }
});

closeSettingsModal.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', async () => {
  state.resolution = modalResolution.value;
  state.fps = parseInt(modalFps.value);
  state.format = modalFormat.value;
  if (modalCamShape) state.camShape = modalCamShape.value;

  const newCamId = modalCameraSelect.value;
  if (newCamId && newCamId !== state.selectedCamDeviceId) {
    state.selectedCamDeviceId = newCamId;
    quickCamSelect.value = newCamId;
    if (state.webcamStream) await startWebcam(newCamId);
  }

  canvasResTag.textContent = state.resolution + ' / ' + state.fps + 'FPS';
  statusFps.textContent = 'FPS: ' + state.fps + '.00';
  statusFormat.textContent = 'Format: ' + (state.format.includes('mp4') ? 'MP4' : 'WebM');

  settingsModal.style.display = 'none';
});

resetAllBtn.addEventListener('click', () => {
  if (state.isRecording) stopRecording();
  stopScreen();
  stopWebcam();
  resetCamPosBtn.click();
  switchScene('screen-cam');
  statusRecText.textContent = 'REC: 00:00:00';
});

window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    startRecBtn.click();
  } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    pauseRecBtn.click();
  }
});

window.addEventListener('resize', () => {
  updateCachedCamBounds();
});

// Initial Setup
discoverCameras();
setupMicAudio();

if (isMobile()) {
  if (flipCamBtn) flipCamBtn.style.display = 'inline-flex';
  switchScene('cam-only');
  startWebcam();
}
