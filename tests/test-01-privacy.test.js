const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, server, PRIVACY_LEVELS, canViewMood } = require('../server');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const JWT_SECRET = 'mood-thermometer-secret-key-2024';

describe('日记隐私控制测试', () => {
    let testUser1, testUser2, testUser3;
    let token1, token2, token3;
    let testDB;

    beforeEach(async () => {
        const testAdapter = new JSONFile('./test-db-privacy.json');
        testDB = new Low(testAdapter, {
            users: [],
            moods: [],
            friendships: [],
            encouragements: [],
            userSettings: []
        });
        await testDB.write();

        testUser1 = { id: 1, username: 'testuser1', nickname: '测试用户1', password: 'password123' };
        testUser2 = { id: 2, username: 'testuser2', nickname: '测试用户2', password: 'password123' };
        testUser3 = { id: 3, username: 'testuser3', nickname: '测试用户3', password: 'password123' };

        token1 = jwt.sign({ userId: testUser1.id, username: testUser1.username, nickname: testUser1.nickname }, JWT_SECRET, { expiresIn: '1h' });
        token2 = jwt.sign({ userId: testUser2.id, username: testUser2.username, nickname: testUser2.nickname }, JWT_SECRET, { expiresIn: '1h' });
        token3 = jwt.sign({ userId: testUser3.id, username: testUser3.username, nickname: testUser3.nickname }, JWT_SECRET, { expiresIn: '1h' });
    });

    afterEach(() => {
        const fs = require('fs');
        if (fs.existsSync('./test-db-privacy.json')) {
            fs.unlinkSync('./test-db-privacy.json');
        }
    });

    describe('隐私级别定义测试', () => {
        it('应该包含正确的三个隐私级别', () => {
            assert.strictEqual(PRIVACY_LEVELS.PUBLIC, 'public');
            assert.strictEqual(PRIVACY_LEVELS.FRIENDS_ONLY, 'friends');
            assert.strictEqual(PRIVACY_LEVELS.PRIVATE, 'private');
        });
    });

    describe('canViewMood 权限检查测试', () => {
        it('用户应该可以查看自己的所有情绪记录', async () => {
            const canView = await canViewMood(1, 1, PRIVACY_LEVELS.PRIVATE);
            assert.strictEqual(canView, true);
        });

        it('公开情绪应该对所有人可见', async () => {
            const canView = await canViewMood(999, 1, PRIVACY_LEVELS.PUBLIC);
            assert.strictEqual(canView, true);
        });

        it('私密情绪应该只有自己可以查看', async () => {
            const canView = await canViewMood(2, 1, PRIVACY_LEVELS.PRIVATE);
            assert.strictEqual(canView, false);
        });
    });

    describe('情绪记录隐私设置测试', () => {
        it('应该可以创建公开的情绪记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    mood_level: 4,
                    note: '今天心情很好',
                    privacy: PRIVACY_LEVELS.PUBLIC
                });
            
            assert.strictEqual(res.statusCode, 200 || 201);
            assert.ok(res.body.message);
        });

        it('应该可以创建仅好友可见的情绪记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    mood_level: 3,
                    note: '一般般',
                    privacy: PRIVACY_LEVELS.FRIENDS_ONLY
                });
            
            assert.strictEqual(res.statusCode, 200 || 201);
        });

        it('应该可以创建私密的情绪记录', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    mood_level: 2,
                    note: '有点难过',
                    privacy: PRIVACY_LEVELS.PRIVATE
                });
            
            assert.strictEqual(res.statusCode, 200 || 201);
        });

        it('不应该接受无效的隐私级别', async () => {
            const res = await request(app)
                .post('/api/mood')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    mood_level: 3,
                    note: '测试',
                    privacy: 'invalid_level'
                });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });
    });

    describe('用户隐私设置测试', () => {
        it('应该可以获取用户隐私设置', async () => {
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${token1}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.default_privacy);
            assert.strictEqual(typeof res.body.allow_encouragement !== undefined);
        });

        it('应该可以更新默认隐私设置', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    default_privacy: PRIVACY_LEVELS.PRIVATE
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.message, '设置已更新');
        });

        it('应该可以关闭鼓励消息接收', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    allow_encouragement: false
                });
            
            assert.strictEqual(res.statusCode, 200);
        });

        it('不应该接受无效的默认隐私设置', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    default_privacy: 'invalid_privacy'
                });
            
            assert.strictEqual(res.statusCode, 400);
        });
    });

    describe('隐私级别API测试', () => {
        it('应该返回所有可用的隐私级别', async () => {
            const res = await request(app)
                .get('/api/privacy-levels');
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body.levels));
            assert.strictEqual(res.body.levels.length, 3);
        });

        it('每个隐私级别应该包含值、标签和描述', async () => {
            const res = await request(app)
                .get('/api/privacy-levels');
            
            res.body.levels.forEach(level => {
                assert.ok(level.value);
                assert.ok(level.label);
                assert.ok(level.description);
            });
        });
    });
});
