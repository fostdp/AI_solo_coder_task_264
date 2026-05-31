const express = require('express');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'mood-thermometer-secret-key-2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const defaultData = {
    users: [],
    moods: [],
    friendships: [],
    encouragements: [],
    userSettings: []
};

const adapter = new JSONFile('./db.json');
const db = new Low(adapter, defaultData);

const initDB = async () => {
    await db.read();
    db.data = db.data || defaultData;
    await db.write();
};

initDB();

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '未登录' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token无效' });
        }
        req.user = user;
        next();
    });
};

const emotionKeywords = {
    happy: ['开心', '快乐', '高兴', '兴奋', '喜悦', '惊喜', '满足', '幸福', '愉快', '棒', '好', '赞', '爽', '爱', '喜欢'],
    sad: ['难过', '伤心', '悲伤', '失落', '沮丧', '郁闷', '痛苦', '哭', '难受', '失望', '心碎'],
    angry: ['生气', '愤怒', '恼火', '烦躁', '不爽', '恨', '气死', '发火', '暴躁'],
    anxious: ['焦虑', '担心', '紧张', '害怕', '恐惧', '不安', '慌', '压力', '担忧'],
    calm: ['平静', '放松', '宁静', '安心', '舒适', '安逸', '悠闲', '淡然'],
    tired: ['累', '疲惫', '疲倦', '困', '乏', '没劲', '空虚'],
    grateful: ['感恩', '感谢', '感激', '谢谢', '幸运', '珍惜']
};

const analyzeEmotion = (text) => {
    if (!text || text.trim().length === 0) {
        return { keywords: [], primaryEmotion: null };
    }

    const lowerText = text.toLowerCase();
    const foundKeywords = [];
    const emotionCounts = {};

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        emotionCounts[emotion] = 0;
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                foundKeywords.push(keyword);
                emotionCounts[emotion]++;
            }
        }
    }

    let primaryEmotion = null;
    let maxCount = 0;
    for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            primaryEmotion = emotion;
        }
    }

    return {
        keywords: [...new Set(foundKeywords)],
        primaryEmotion,
        emotionCounts
    };
};

const PRIVACY_LEVELS = {
    PUBLIC: 'public',
    FRIENDS_ONLY: 'friends',
    PRIVATE: 'private'
};

const canViewMood = async (viewerId, moodOwnerId, moodPrivacy) => {
    if (viewerId === moodOwnerId) {
        return true;
    }

    if (moodPrivacy === PRIVACY_LEVELS.PUBLIC) {
        return true;
    }

    if (moodPrivacy === PRIVACY_LEVELS.FRIENDS_ONLY) {
        await db.read();
        const friendship = db.data.friendships.find(
            f => f.user_id === moodOwnerId && f.friend_id === viewerId
        );
        return !!friendship;
    }

    return false;
};

const ENCOURAGE_RATE_LIMIT = {
    MAX_PER_HOUR: 5,
    MAX_PER_USER_PER_DAY: 3
};

const checkEncourageRateLimit = async (fromUserId, toUserId) => {
    await db.read();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const userEncouragements = db.data.encouragements.filter(
        e => e.from_user_id === fromUserId && new Date(e.created_at) > oneHourAgo
    );

    if (userEncouragements.length >= ENCOURAGE_RATE_LIMIT.MAX_PER_HOUR) {
        return { allowed: false, reason: '每小时最多发送5条鼓励消息' };
    }

    const perUserEncouragements = userEncouragements.filter(
        e => e.to_user_id === toUserId && new Date(e.created_at) > oneDayAgo
    );

    if (perUserEncouragements.length >= ENCOURAGE_RATE_LIMIT.MAX_PER_USER_PER_DAY) {
        return { allowed: false, reason: '每天最多给同一用户发送3条鼓励消息' };
    }

    return { allowed: true };
};

const aggregateFriendMoods = async (userId, days = 7) => {
    await db.read();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const friendIds = db.data.friendships
        .filter(f => f.user_id === userId)
        .map(f => f.friend_id);

    const friendMoodData = [];

    for (const friendId of friendIds) {
        const friend = db.data.users.find(u => u.id === friendId);
        if (!friend) continue;

        const friendMoods = db.data.moods
            .filter(m => m.user_id === friendId && new Date(m.created_at) >= cutoffDate)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const moodLevels = friendMoods.map(m => m.mood_level);
        const avgMood = moodLevels.length > 0 
            ? (moodLevels.reduce((a, b) => a + b, 0) / moodLevels.length).toFixed(1) 
            : null;

        const latestMood = friendMoods[0] || null;
        const moodTrend = moodLevels.length >= 2 
            ? moodLevels[0] - moodLevels[moodLevels.length - 1] 
            : 0;

        const keywordFrequency = {};
        friendMoods.forEach(mood => {
            if (mood.emotion_analysis && mood.emotion_analysis.keywords) {
                mood.emotion_analysis.keywords.forEach(kw => {
                    keywordFrequency[kw] = (keywordFrequency[kw] || 0) + 1;
                });
            }
        });

        const topKeywords = Object.entries(keywordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([keyword]) => keyword);

        friendMoodData.push({
            userId: friendId,
            nickname: friend.nickname,
            moods: friendMoods,
            avgMood,
            latestMood,
            moodTrend,
            topKeywords,
            recordCount: moodLevels.length
        });
    }

    friendMoodData.sort((a, b) => {
        if (a.avgMood === null) return 1;
        if (b.avgMood === null) return -1;
        return a.avgMood - b.avgMood;
    });

    const overallStats = {
        totalFriends: friendIds.length,
        activeFriends: friendMoodData.filter(f => f.recordCount > 0).length,
        avgGroupMood: friendMoodData.filter(f => f.avgMood).length > 0
            ? (friendMoodData.filter(f => f.avgMood).reduce((sum, f) => sum + parseFloat(f.avgMood), 0) / 
               friendMoodData.filter(f => f.avgMood).length).toFixed(1)
            : null,
        lowMoodFriends: friendMoodData.filter(f => f.avgMood && f.avgMood <= 2).length,
        highMoodFriends: friendMoodData.filter(f => f.avgMood && f.avgMood >= 4).length
    };

    return { friends: friendMoodData, stats: overallStats };
};

app.post('/api/analyze-emotion', (req, res) => {
    const { text } = req.body;
    const analysis = analyzeEmotion(text);
    res.json(analysis);
});

app.post('/api/register', async (req, res) => {
    const { username, password, nickname } = req.body;

    if (!username || !password || !nickname) {
        return res.status(400).json({ error: '请填写完整信息' });
    }

    await db.read();
    const existingUser = db.data.users.find(u => u.username === username);
    
    if (existingUser) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
        id: db.data.users.length + 1,
        username,
        password: hashedPassword,
        nickname,
        created_at: new Date().toISOString()
    };

    db.data.users.push(newUser);
    
    const defaultSettings = {
        user_id: newUser.id,
        default_privacy: PRIVACY_LEVELS.FRIENDS_ONLY,
        allow_encouragement: true,
        show_mood_trend: true,
        created_at: new Date().toISOString()
    };
    db.data.userSettings.push(defaultSettings);
    
    await db.write();

    const token = jwt.sign({ userId: newUser.id, username, nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: newUser.id, username, nickname } });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    await db.read();
    const user = db.data.users.find(u => u.username === username);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname } });
});

app.post('/api/mood', authenticateToken, async (req, res) => {
    const { mood_level, note, privacy = PRIVACY_LEVELS.FRIENDS_ONLY } = req.body;
    const userId = req.user.userId;

    if (!mood_level || mood_level < 1 || mood_level > 5) {
        return res.status(400).json({ error: '情绪等级必须在1-5之间' });
    }

    if (!Object.values(PRIVACY_LEVELS).includes(privacy)) {
        return res.status(400).json({ error: '无效的隐私级别' });
    }

    const emotionAnalysis = analyzeEmotion(note);

    await db.read();
    const today = new Date().toISOString().split('T')[0];
    const existingIndex = db.data.moods.findIndex(
        m => m.user_id === userId && new Date(m.created_at).toISOString().split('T')[0] === today
    );

    if (existingIndex !== -1) {
        db.data.moods[existingIndex].mood_level = mood_level;
        db.data.moods[existingIndex].note = note || '';
        db.data.moods[existingIndex].privacy = privacy;
        db.data.moods[existingIndex].emotion_analysis = emotionAnalysis;
        db.data.moods[existingIndex].updated_at = new Date().toISOString();
        await db.write();
        res.json({ 
            message: '更新成功', 
            moodId: db.data.moods[existingIndex].id,
            emotionAnalysis 
        });
    } else {
        const newMood = {
            id: db.data.moods.length + 1,
            user_id: userId,
            mood_level,
            note: note || '',
            privacy,
            emotion_analysis: emotionAnalysis,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        db.data.moods.push(newMood);
        await db.write();
        res.json({ 
            message: '记录成功', 
            moodId: newMood.id,
            emotionAnalysis 
        });
    }
});

app.get('/api/moods', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const days = parseInt(req.query.days) || 30;

    await db.read();
    const moods = db.data.moods
        .filter(m => m.user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, days);

    res.json(moods);
});

app.get('/api/mood/today', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    await db.read();
    const mood = db.data.moods.find(
        m => m.user_id === userId && new Date(m.created_at).toISOString().split('T')[0] === today
    );

    res.json(mood ? { mood_level: mood.mood_level, note: mood.note, privacy: mood.privacy } : null);
});

app.post('/api/friends/add', authenticateToken, async (req, res) => {
    const { friendUsername } = req.body;
    const userId = req.user.userId;

    await db.read();
    const friend = db.data.users.find(u => u.username === friendUsername);
    
    if (!friend) {
        return res.status(400).json({ error: '用户不存在' });
    }

    if (friend.id === userId) {
        return res.status(400).json({ error: '不能添加自己为好友' });
    }

    const existingFriendship = db.data.friendships.find(
        f => f.user_id === userId && f.friend_id === friend.id
    );

    if (existingFriendship) {
        return res.status(400).json({ error: '已经是好友了' });
    }

    const newFriendship = {
        id: db.data.friendships.length + 1,
        user_id: userId,
        friend_id: friend.id,
        created_at: new Date().toISOString()
    };

    db.data.friendships.push(newFriendship);
    await db.write();

    res.json({ message: '添加成功', friend: { id: friend.id, nickname: friend.nickname } });
});

app.get('/api/friends', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    await db.read();
    const friendIds = db.data.friendships
        .filter(f => f.user_id === userId)
        .map(f => f.friend_id);

    const friends = db.data.users
        .filter(u => friendIds.includes(u.id))
        .map(u => ({ id: u.id, nickname: u.nickname, username: u.username }));

    res.json(friends);
});

app.get('/api/friends/moods', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const days = parseInt(req.query.days) || 7;

    const result = await aggregateFriendMoods(userId, days);
    res.json(result);
});

app.post('/api/encourage', authenticateToken, async (req, res) => {
    const { toUserId, message, isAnonymous = true } = req.body;
    const fromUserId = req.user.userId;

    if (!toUserId || !message) {
        return res.status(400).json({ error: '请填写完整信息' });
    }

    if (message.length > 500) {
        return res.status(400).json({ error: '鼓励消息不能超过500字' });
    }

    const rateLimit = await checkEncourageRateLimit(fromUserId, toUserId);
    if (!rateLimit.allowed) {
        return res.status(429).json({ error: rateLimit.reason });
    }

    await db.read();
    
    const targetUserSettings = db.data.userSettings.find(s => s.user_id === toUserId);
    if (targetUserSettings && !targetUserSettings.allow_encouragement) {
        return res.status(403).json({ error: '该用户已关闭鼓励消息功能' });
    }

    const isFriend = db.data.friendships.some(
        f => f.user_id === fromUserId && f.friend_id === toUserId
    );

    if (!isFriend) {
        return res.status(403).json({ error: '只能给好友发送鼓励消息' });
    }

    const newEncouragement = {
        id: db.data.encouragements.length + 1,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        message,
        is_anonymous: isAnonymous,
        created_at: new Date().toISOString()
    };

    db.data.encouragements.push(newEncouragement);
    await db.write();

    res.json({ message: '鼓励已发送', encouragementId: newEncouragement.id });
});

app.get('/api/encouragements', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    await db.read();
    const encouragements = db.data.encouragements
        .filter(e => e.to_user_id === userId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + limit)
        .map(e => {
            let from = '匿名好友';
            if (!e.is_anonymous) {
                const fromUser = db.data.users.find(u => u.id === e.from_user_id);
                if (fromUser) {
                    from = fromUser.nickname;
                }
            }
            return {
                id: e.id,
                message: e.message,
                from,
                created_at: e.created_at
            };
        });

    res.json(encouragements);
});

app.get('/api/settings', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    await db.read();
    let settings = db.data.userSettings.find(s => s.user_id === userId);
    
    if (!settings) {
        settings = {
            user_id: userId,
            default_privacy: PRIVACY_LEVELS.FRIENDS_ONLY,
            allow_encouragement: true,
            show_mood_trend: true
        };
    }

    res.json(settings);
});

app.put('/api/settings', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { default_privacy, allow_encouragement, show_mood_trend } = req.body;

    if (default_privacy && !Object.values(PRIVACY_LEVELS).includes(default_privacy)) {
        return res.status(400).json({ error: '无效的隐私级别' });
    }

    await db.read();
    let settingsIndex = db.data.userSettings.findIndex(s => s.user_id === userId);
    
    if (settingsIndex === -1) {
        const newSettings = {
            user_id: userId,
            default_privacy: default_privacy || PRIVACY_LEVELS.FRIENDS_ONLY,
            allow_encouragement: allow_encouragement !== undefined ? allow_encouragement : true,
            show_mood_trend: show_mood_trend !== undefined ? show_mood_trend : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        db.data.userSettings.push(newSettings);
    } else {
        if (default_privacy) db.data.userSettings[settingsIndex].default_privacy = default_privacy;
        if (allow_encouragement !== undefined) db.data.userSettings[settingsIndex].allow_encouragement = allow_encouragement;
        if (show_mood_trend !== undefined) db.data.userSettings[settingsIndex].show_mood_trend = show_mood_trend;
        db.data.userSettings[settingsIndex].updated_at = new Date().toISOString();
    }
    
    await db.write();
    res.json({ message: '设置已更新' });
});

app.get('/api/privacy-levels', (req, res) => {
    res.json({
        levels: [
            { value: PRIVACY_LEVELS.PUBLIC, label: '公开', description: '所有人可见' },
            { value: PRIVACY_LEVELS.FRIENDS_ONLY, label: '仅好友可见', description: '只有好友可以查看' },
            { value: PRIVACY_LEVELS.PRIVATE, label: '私密', description: '只有自己可以查看' }
        ]
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});

module.exports = { app, server, analyzeEmotion, aggregateFriendMoods, checkEncourageRateLimit, canViewMood, PRIVACY_LEVELS, ENCOURAGE_RATE_LIMIT };
