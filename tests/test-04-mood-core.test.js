const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, server } = require('../server');

const JWT_SECRET = 'mood-thermometer-secret-key-2024';

describe('情绪记录核心功能测试', () => {
    let testUser;
    let testToken;

    beforeEach(async () => {
        testUser = { id: 1, username: 'testuser', nickname: '测试用户', password: 'password123' };
        testToken = jwt.sign({ userId: testUser.id, username: testUser.username, nickname: testUser.nickname }, JWT_SECRET, { expiresIn: '1h' });
    });

    afterEach(() => {
        const fs = require('fs');
        if (fs.existsSync('./db.json')) {
            fs.unlinkSync('./db.json');
        }
    });

    describe('用户认证测试', () => {
        it('应该可以成功注册新用户', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    username: 'newuser',
                    password: 'password123',
                    nickname: '新用户'
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.token);
            assert.ok(res.body.user);
        });

        it('不应该注册已存在的用户名', async () => {
            await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser',
                    password: 'password123',
                    nickname: '测试用户'
                });

            const res = await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser',
                    password: 'password456',
                    nickname: '测试用户2'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.error, '用户名已存在');
        });

        it('不应该注册缺少信息的用户', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('应该可以成功登录', async () => {
            await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser',
                    password: 'password123',
                    nickname: '测试用户'
                });

            const res = await request(app)
                .post('/api/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.token);
            assert.ok(res.body.user);
        });

        it('不应该用错误密码登录', async () => {
            await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser',
                    password: 'password123',
                    nickname: '测试用户'
                });

            const res = await request(app)
                .post('/api/login')
                .send({
                    username: 'testuser',
                    password: 'wrongpassword'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('不应该登录不存在的用户', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    username: 'nonexistent',
                    password: 'password123'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('未登录用户不应该访问需要认证的API', async () => {
            const res = await request(app)
                .get('/api/moods');
            
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.error, '未登录');
        });

        it('无效Token不应该访问需要认证的API', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', 'Bearer invalid-token');
            
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error, 'Token无效');
        });
    });

    describe('情绪记录创建测试', () => {
        it('应该可以创建情绪记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 4,
                    note: '今天心情不错'
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.message);
        });

        it('创建情绪记录应该返回情绪分析结果', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 4,
                    note: '今天很开心，心情非常好'
                });
            
            assert.ok(res.body.emotionAnalysis);
            assert.ok(res.body.emotionAnalysis.keywords);
        });

        it('不应该创建情绪等级小于1的记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 0,
                    note: '测试'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('不应该创建情绪等级大于5的记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 6,
                    note: '测试'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('不应该创建缺少情绪等级的记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    note: '测试'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('应该可以创建没有笔记的情绪记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 3
                });
            
            assert.strictEqual(res.statusCode, 200);
        });
    });

    describe('情绪记录更新测试', () => {
        it('同一天应该可以更新情绪记录', async () => {
            const firstRecord = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 3,
                    note: '一般般'
                });
            
            const updatedRecord = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 4,
                    note: '现在心情变好了'
                });
            
            assert.strictEqual(updatedRecord.statusCode, 200);
            assert.strictEqual(updatedRecord.body.message, '更新成功');
        });
    });

    describe('情绪记录查询测试', () => {
        beforeEach(async () => {
            for (let i = 1; i <= 5; i++) {
                await request(app)
                    .post('/api/mood')
                    .set('Authorization', `Bearer ${testToken}`)
                    .send({
                        mood_level: i,
                        note: `第${i}天的心情`
                    });
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        });

        it('应该可以获取情绪记录列表', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body));
        });

        it('情绪记录应该按时间倒序排列', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.length >= 2) {
                const time1 = new Date(res.body[0].created_at).getTime();
                const time2 = new Date(res.body[1].created_at).getTime();
                assert.ok(time1 >= time2, '记录应该按时间倒序排列');
            }
        });

        it('情绪记录应该包含情绪等级', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.length > 0) {
                assert.ok(res.body[0].mood_level !== undefined);
            }
        });

        it('情绪记录应该包含笔记内容', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.length > 0) {
                assert.ok(res.body[0].note !== undefined);
            }
        });

        it('情绪记录应该包含情绪分析结果', async () => {
            const res = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.length > 0) {
                assert.ok(res.body[0].emotion_analysis !== undefined);
            }
        });
    });

    describe('今日情绪查询测试', () => {
        it('应该可以获取今日情绪记录', async () => {
            await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    mood_level: 4,
                    note: '今天心情很好'
                });

            const res = await request(app)
                .get('/api/mood/today')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body);
            assert.strictEqual(res.body.mood_level, 4);
        });

        it('没有今日记录时应该返回null', async () => {
            const res = await request(app)
                .get('/api/mood/today')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body, null);
        });
    });

    describe('情绪分析API测试', () => {
        it('应该可以单独分析情绪文本', async () => {
            const res = await request(app)
                .post('/api/analyze-emotion')
                .send({
                    text: '今天很开心，也很兴奋'
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body.keywords));
            assert.ok(res.body.primaryEmotion !== undefined);
        });

        it('分析多种情绪应该返回正确的主要情绪', async () => {
            const res = await request(app)
                .post('/api/analyze-emotion')
                .send({
                    text: '今天很开心，很高兴，很快乐'
                });
            
            assert.strictEqual(res.body.primaryEmotion, 'happy');
        });

        it('分析空文本应该返回空结果', async () => {
            const res = await request(app)
                .post('/api/analyze-emotion')
                .send({
                    text: ''
                });
            
            assert.deepStrictEqual(res.body.keywords, []);
            assert.strictEqual(res.body.primaryEmotion, null);
        });
    });

    describe('用户设置测试', () => {
        it('应该可以获取用户设置', async () => {
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body);
        });

        it('应该可以更新所有用户设置', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    default_privacy: 'private',
                    allow_encouragement: false,
                    show_mood_trend: false
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.message, '设置已更新');
        });

        it('应该可以部分更新用户设置', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    allow_encouragement: false
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.message, '设置已更新');
        });
    });

    describe('情绪隐私级别API测试', () => {
        it('应该返回所有可用的隐私级别', async () => {
            const res = await request(app)
                .get('/api/privacy-levels');
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body.levels));
            assert.strictEqual(res.body.levels.length, 3);
        });

        it('每个隐私级别应该包含正确的描述', async () => {
            const res = await request(app)
                .get('/api/privacy-levels');
            
            const labels = res.body.levels.map(l => l.label);
            assert.ok(labels.includes('公开'));
            assert.ok(labels.includes('仅好友可见'));
            assert.ok(labels.includes('私密'));
        });
    });

    describe('完整用户流程测试', () => {
        it('应该完成完整的用户注册-打卡-查看流程', async () => {
            const registerRes = await request(app)
                .post('/api/register')
                .send({
                    username: 'fulltest',
                    password: 'password123',
                    nickname: '完整测试用户'
                });
            assert.strictEqual(registerRes.statusCode, 200);

            const userToken = registerRes.body.token;

            const moodRes = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    mood_level: 4,
                    note: '今天测试很顺利，很开心！'
                });
            assert.strictEqual(moodRes.statusCode, 200);

            const moodsRes = await request(app)
                .get('/api/moods')
                .set('Authorization', `Bearer ${userToken}`);
            assert.strictEqual(moodsRes.statusCode, 200);
            assert.ok(moodsRes.body.length > 0);

            const todayRes = await request(app)
                .get('/api/mood/today')
                .set('Authorization', `Bearer ${userToken}`);
            assert.strictEqual(todayRes.statusCode, 200);
            assert.ok(todayRes.body);
        });
    });
});
