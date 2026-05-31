let currentUser = null;
let selectedMoodLevel = null;
let moodChart = null;
let currentEncourageUserId = null;
let breathingInterval = null;
let timerInterval = null;
let breathingSeconds = 0;

const emotionNames = {
    happy: '开心',
    sad: '难过',
    angry: '生气',
    anxious: '焦虑',
    calm: '平静',
    tired: '疲惫',
    grateful: '感恩'
};

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('moodTheme') || 'default';
    document.body.setAttribute('data-theme', savedTheme);
    
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('moodTheme', theme);
        });
    });
    
    const token = localStorage.getItem('moodToken');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = {
                id: payload.userId,
                username: payload.username,
                nickname: payload.nickname
            };
            showMainPage();
        } catch (e) {
            localStorage.removeItem('moodToken');
        }
    }

    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.mood-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedMoodLevel = parseInt(option.dataset.level);
        });
    });
});

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`).classList.add('active');
    
    document.getElementById('loginForm').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'flex' : 'none';
    document.getElementById('authError').style.display = 'none';
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showAuthError('请填写用户名和密码');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('moodToken', data.token);
            currentUser = data.user;
            showMainPage();
        } else {
            showAuthError(data.error || '登录失败');
        }
    } catch (e) {
        showAuthError('网络错误，请重试');
    }
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const nickname = document.getElementById('regNickname').value;
    const password = document.getElementById('regPassword').value;

    if (!username || !nickname || !password) {
        showAuthError('请填写完整信息');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, nickname, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('moodToken', data.token);
            currentUser = data.user;
            showMainPage();
        } else {
            showAuthError(data.error || '注册失败');
        }
    } catch (e) {
        showAuthError('网络错误，请重试');
    }
}

function showAuthError(msg) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
}

function showMainPage() {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('mainPage').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('nicknameDisplay').textContent = currentUser.nickname;
    
    loadTodayMood();
    loadEncouragements();
    loadMoodChart();
    loadFriendsMoods();
}

function logout() {
    stopBreathing();
    localStorage.removeItem('moodToken');
    currentUser = null;
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('authPage').style.display = 'block';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

function switchNav(nav) {
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-tab[onclick="switchNav('${nav}')"]`).classList.add('active');
    
    document.getElementById('moodSection').style.display = nav === 'mood' ? 'block' : 'none';
    document.getElementById('chartSection').style.display = nav === 'chart' ? 'block' : 'none';
    document.getElementById('breatheSection').style.display = nav === 'breathe' ? 'block' : 'none';
    document.getElementById('friendsSection').style.display = nav === 'friends' ? 'block' : 'none';
    
    if (nav === 'chart') {
        setTimeout(() => loadMoodChart(), 100);
    }
    if (nav === 'friends') {
        loadFriendsMoods();
    }
}

let analyzeDebounceTimer = null;

async function analyzeMoodText() {
    const text = document.getElementById('moodNote').value;
    const analysisEl = document.getElementById('emotionAnalysis');
    const tagsEl = document.getElementById('emotionTags');
    const primaryEl = document.getElementById('primaryEmotion');

    if (!text || text.trim().length === 0) {
        analysisEl.style.display = 'none';
        return;
    }

    if (analyzeDebounceTimer) {
        clearTimeout(analyzeDebounceTimer);
    }

    analyzeDebounceTimer = setTimeout(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch('/api/analyze-emotion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.substring(0, 1000) }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const analysis = await response.json();
            
            if (analysis.keywords && analysis.keywords.length > 0) {
                tagsEl.innerHTML = analysis.keywords.map(kw => 
                    `<span class="emotion-tag">${kw}</span>`
                ).join('');
                
                if (analysis.primaryEmotion) {
                    primaryEl.textContent = `主要情绪: ${emotionNames[analysis.primaryEmotion] || analysis.primaryEmotion}`;
                } else {
                    primaryEl.textContent = '';
                }
                
                analysisEl.style.display = 'block';
            } else {
                analysisEl.style.display = 'none';
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('情绪分析超时');
            } else {
                console.error('情绪分析失败', e);
            }
        }
    }, 500);
}

async function loadTodayMood() {
    try {
        const response = await fetch('/api/mood/today', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('moodToken')}` }
        });
        
        const data = await response.json();
        if (data) {
            selectedMoodLevel = data.mood_level;
            document.querySelectorAll('.mood-option').forEach(option => {
                option.classList.remove('selected');
                if (parseInt(option.dataset.level) === data.mood_level) {
                    option.classList.add('selected');
                }
            });
            document.getElementById('moodNote').value = data.note || '';
            analyzeMoodText();
        }
    } catch (e) {
        console.error('加载今日情绪失败', e);
    }
}

async function saveMood() {
    if (!selectedMoodLevel) {
        showMoodStatus('请先选择情绪等级', false);
        return;
    }

    const note = document.getElementById('moodNote').value;

    try {
        const response = await fetch('/api/mood', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('moodToken')}`
            },
            body: JSON.stringify({ mood_level: selectedMoodLevel, note })
        });

        const data = await response.json();
        if (response.ok) {
            showMoodStatus('心情已保存！', true);
            loadMoodChart();
        } else {
            showMoodStatus(data.error || '保存失败', false);
        }
    } catch (e) {
        showMoodStatus('网络错误，请重试', false);
    }
}

function showMoodStatus(msg, isSuccess) {
    const statusEl = document.getElementById('moodStatus');
    statusEl.textContent = msg;
    statusEl.style.color = isSuccess ? '#27ae60' : '#e74c3c';
    statusEl.style.background = isSuccess ? '#efe' : '#fee';
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

async function loadMoodChart() {
    try {
        const response = await fetch('/api/moods?days=30', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('moodToken')}` }
        });
        
        const moods = await response.json();
        
        const reversedMoods = moods.reverse();
        const labels = reversedMoods.map(m => {
            const date = new Date(m.created_at);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        });
        const data = reversedMoods.map(m => m.mood_level);
        
        if (moodChart) {
            moodChart.destroy();
        }
        
        const ctx = document.getElementById('moodChart').getContext('2d');
        moodChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '情绪指数',
                    data: data,
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim() || '#764ba2',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        min: 1,
                        max: 5,
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                const emojis = ['', '😢', '😐', '🙂', '😊', '😄'];
                                return emojis[value];
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        if (moods.length > 0) {
            const avg = (moods.reduce((sum, m) => sum + m.mood_level, 0) / moods.length).toFixed(1);
            const max = Math.max(...moods.map(m => m.mood_level));
            const min = Math.min(...moods.map(m => m.mood_level));
            
            document.getElementById('avgMood').textContent = avg;
            document.getElementById('maxMood').textContent = getMoodEmoji(max);
            document.getElementById('minMood').textContent = getMoodEmoji(min);
        }
    } catch (e) {
        console.error('加载情绪曲线失败', e);
    }
}

function getMoodEmoji(level) {
    const emojis = { 1: '😢', 2: '😐', 3: '🙂', 4: '😊', 5: '😄' };
    return emojis[level] || '-';
}

async function addFriend() {
    const username = document.getElementById('friendUsername').value.trim();
    if (!username) {
        showFriendStatus('请输入好友用户名', false);
        return;
    }

    try {
        const response = await fetch('/api/friends/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('moodToken')}`
            },
            body: JSON.stringify({ friendUsername: username })
        });

        const data = await response.json();
        if (response.ok) {
            showFriendStatus('好友添加成功！', true);
            document.getElementById('friendUsername').value = '';
            loadFriendsMoods();
        } else {
            showFriendStatus(data.error || '添加失败', false);
        }
    } catch (e) {
        showFriendStatus('网络错误，请重试', false);
    }
}

function showFriendStatus(msg, isSuccess) {
    const statusEl = document.getElementById('friendStatus');
    statusEl.textContent = msg;
    statusEl.style.color = isSuccess ? '#27ae60' : '#e74c3c';
    statusEl.style.background = isSuccess ? '#efe' : '#fee';
    statusEl.style.display = 'block';
    
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

async function loadFriendsMoods() {
    try {
        const response = await fetch('/api/friends/moods', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('moodToken')}` }
        });
        
        const friends = await response.json();
        const listEl = document.getElementById('friendsMoodList');
        
        if (friends.length === 0) {
            listEl.innerHTML = '<p style="color: #999; text-align: center;">暂无好友，添加好友后查看他们的情绪动态吧~</p>';
            return;
        }
        
        listEl.innerHTML = friends.map(friend => {
            const recentMoods = friend.moods.slice(0, 7).reverse();
            const barsHtml = recentMoods.map(mood => {
                const heightPercent = (mood.mood_level / 5) * 100;
                const colorClass = getMoodColorClass(mood.mood_level);
                return `<div class="mood-bar ${colorClass}" style="height: ${heightPercent}%"></div>`;
            }).join('');
            
            const latestMood = friend.moods[0];
            const latestNote = latestMood && latestMood.note ? 
                `<p style="font-size: 0.85rem; color: #888; margin-top: 10px;">"${latestMood.note.substring(0, 30)}${latestMood.note.length > 30 ? '...' : ''}"</p>` : '';
            
            return `
                <div class="friend-mood-card">
                    <div class="friend-header">
                        <span class="friend-name">${friend.nickname}</span>
                        <button class="encourage-btn" onclick="openEncourageModal(${friend.userId}, '${friend.nickname}')">💪 鼓励TA</button>
                    </div>
                    <div class="friend-mood-bars">${barsHtml || '<span style="color: #999;">暂无情绪记录</span>'}</div>
                    ${latestNote}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('加载好友情绪失败', e);
    }
}

function getMoodColorClass(level) {
    if (level === 1) return 'low';
    if (level === 2) return 'med-low';
    if (level === 3) return 'medium';
    if (level === 4) return 'med-high';
    return 'high';
}

function openEncourageModal(userId, nickname) {
    currentEncourageUserId = userId;
    document.getElementById('encourageTo').textContent = `给 ${nickname} 发送鼓励`;
    document.getElementById('encourageMessage').value = '';
    document.getElementById('encourageModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('encourageModal').style.display = 'none';
    currentEncourageUserId = null;
}

async function sendEncouragement() {
    const message = document.getElementById('encourageMessage').value.trim();
    const isAnonymous = document.getElementById('isAnonymous').checked;

    if (!message) {
        alert('请输入鼓励的话语');
        return;
    }

    try {
        const response = await fetch('/api/encourage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('moodToken')}`
            },
            body: JSON.stringify({ toUserId: currentEncourageUserId, message, isAnonymous })
        });

        if (response.ok) {
            closeModal();
            alert('鼓励已发送！');
        } else {
            const data = await response.json();
            alert(data.error || '发送失败');
        }
    } catch (e) {
        alert('网络错误，请重试');
    }
}

async function loadEncouragements() {
    try {
        const response = await fetch('/api/encouragements', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('moodToken')}` }
        });
        
        const encouragements = await response.json();
        const listEl = document.getElementById('encouragementList');
        
        if (encouragements.length === 0) {
            listEl.innerHTML = '<p style="color: #999; text-align: center;">暂无收到的鼓励~</p>';
            return;
        }
        
        listEl.innerHTML = encouragements.map(e => `
            <div class="encouragement-item">
                <p>${e.message}</p>
                <div class="encouragement-from">— ${e.from}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error('加载鼓励失败', e);
    }
}

function startBreathing() {
    const mode = document.getElementById('breatheMode').value;
    const circle = document.getElementById('breatheCircle');
    const text = document.getElementById('breatheText');
    
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('breatheTimer').style.display = 'block';
    
    breathingSeconds = 0;
    updateTimer();
    
    timerInterval = setInterval(() => {
        breathingSeconds++;
        updateTimer();
    }, 1000);
    
    let breathSequence = [];
    if (mode === '4-7-8') {
        breathSequence = [
            { action: 'inhale', duration: 4, text: '吸气...' },
            { action: 'hold', duration: 7, text: '屏气...' },
            { action: 'exhale', duration: 8, text: '呼气...' }
        ];
    } else if (mode === 'box') {
        breathSequence = [
            { action: 'inhale', duration: 4, text: '吸气...' },
            { action: 'hold', duration: 4, text: '屏气...' },
            { action: 'exhale', duration: 4, text: '呼气...' },
            { action: 'hold', duration: 4, text: '屏气...' }
        ];
    } else {
        breathSequence = [
            { action: 'inhale', duration: 5, text: '吸气...' },
            { action: 'exhale', duration: 5, text: '呼气...' }
        ];
    }
    
    let currentStep = 0;
    
    function runStep() {
        const step = breathSequence[currentStep];
        circle.className = 'breathe-circle ' + step.action;
        text.textContent = step.text;
        
        let countdown = step.duration;
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                text.textContent = step.text.replace('...', ` ${countdown}...`);
            }
        }, 1000);
        
        breathingInterval = setTimeout(() => {
            clearInterval(countdownInterval);
            currentStep = (currentStep + 1) % breathSequence.length;
            if (breathingInterval) {
                runStep();
            }
        }, step.duration * 1000);
    }
    
    runStep();
}

function stopBreathing() {
    if (breathingInterval) {
        clearTimeout(breathingInterval);
        breathingInterval = null;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    const circle = document.getElementById('breatheCircle');
    const text = document.getElementById('breatheText');
    
    circle.className = 'breathe-circle';
    text.textContent = '准备开始';
    
    document.getElementById('startBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
}

function updateTimer() {
    const minutes = Math.floor(breathingSeconds / 60);
    const seconds = breathingSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
