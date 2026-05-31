const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, server, analyzeEmotion } = require('../server');

const JWT_SECRET = 'mood-thermometer-secret-key-2024';

describe('好友情绪聚合算法测试', () => {
    let testUser, friend1, friend2, friend3;
    let testToken, friend1Token, friend2Token, friend3Token;

    beforeEach(async () => {
        testUser = { id: 1, username: 'testuser', nickname: '测试用户', password: 'password123' };
        friend1 = { id: 2, username: 'friend1', nickname: '好友1', password: 'password123' };
        friend2 = { id: 3, username: 'friend2', nickname: '好友2', password: 'password123' };
        friend3 = { id: 4, username: 'friend3', nickname: '好友3', password: 'password123' };

        testToken = jwt.sign({ userId: testUser.id, username: testUser.username, nickname: testUser.nickname }, JWT_SECRET, { expiresIn: '1h' });
        friend1Token = jwt.sign({ userId: friend1.id, username: friend1.username, nickname: friend1.nickname }, JWT_SECRET, { expiresIn: '1h' });
        friend2Token = jwt.sign({ userId: friend2.id, username: friend2.username, nickname: friend2.nickname }, JWT_SECRET, { expiresIn: '1h' });
        friend3Token = jwt.sign({ userId: friend3.id, username: friend3.username, nickname: friend3.nickname }, JWT_SECRET, { expiresIn: '1h' });
    });

    afterEach(() => {
        const fs = require('fs');
        if (fs.existsSync('./db.json')) {
            fs.unlinkSync('./db.json');
        }
    });

    describe('情绪关键词分析测试', () => {
        it('应该正确识别开心情绪关键词', () => {
            const result = analyzeEmotion('今天很开心，心情非常好');
            assert.ok(result.keywords.includes('开心'));
            assert.strictEqual(result.primaryEmotion, 'happy');
        });

        it('应该正确识别难过情绪关键词', () => {
            const result = analyzeEmotion('今天很难过，心情很失落');
            assert.ok(result.keywords.includes('难过'));
            assert.strictEqual(result.primaryEmotion, 'sad');
        });

        it('应该正确识别生气情绪关键词', () => {
            const result = analyzeEmotion('今天很生气，非常恼火');
            assert.ok(result.keywords.includes('生气'));
            assert.strictEqual(result.primaryEmotion, 'angry');
        });

        it('应该正确识别焦虑情绪关键词', () => {
            const result = analyzeEmotion('今天很焦虑，压力很大，很担心');
            assert.ok(result.keywords.includes('焦虑'));
            assert.strictEqual(result.primaryEmotion, 'anxious');
        });

        it('应该正确识别平静情绪关键词', () => {
            const result = analyzeEmotion('今天很平静，很放松');
            assert.ok(result.keywords.includes('平静'));
            assert.strictEqual(result.primaryEmotion, 'calm');
        });

        it('应该正确识别疲惫情绪关键词', () => {
            const result = analyzeEmotion('今天很累，很疲惫，没有力气');
            assert.ok(result.keywords.includes('累'));
            assert.strictEqual(result.primaryEmotion, 'tired');
        });

        it('应该正确识别感恩情绪关键词', () => {
            const result = analyzeEmotion('今天很感恩，感谢所有的一切');
            assert.ok(result.keywords.includes('感恩'));
            assert.strictEqual(result.primaryEmotion, 'grateful');
        });

        it('空文本应该返回空的关键词数组', () => {
            const result = analyzeEmotion('');
            assert.deepStrictEqual(result.keywords, []);
            assert.strictEqual(result.primaryEmotion, null);
        });

        it('空白文本应该返回空的关键词数组', () => {
            const result = analyzeEmotion('   ');
            assert.deepStrictEqual(result.keywords, []);
            assert.strictEqual(result.primaryEmotion, null);
        });

        it('应该识别多个关键词并去重', () => {
            const result = analyzeEmotion('今天很开心，非常开心，很快乐');
            const uniqueKeywords = [...new Set(result.keywords)];
            assert.strictEqual(result.keywords.length, uniqueKeywords.length);
        });
    });

    describe('好友情绪聚合API测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });
            
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend2' });
        });

        it('应该可以获取好友情绪列表', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body.friends));
            assert.ok(res.body.stats);
        });

        it('应该返回正确的统计信息结构', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(typeof res.body.stats.totalFriends !== undefined);
            assert.strictEqual(typeof res.body.stats.activeFriends !== undefined);
            assert.strictEqual(typeof res.body.stats.avgGroupMood !== undefined);
            assert.strictEqual(typeof res.body.stats.lowMoodFriends !== undefined);
            assert.strictEqual(typeof res.body.stats.highMoodFriends !== undefined);
        });

        it('应该可以指定查询天数', async () => {
            const res = await request(app)
                .get('/api/friends/moods?days=14')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
        });

        it('好友情绪数据应该包含平均情绪', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.friends.length > 0) {
                const friendData = res.body.friends[0];
                assert.strictEqual(friendData.userId !== undefined);
                assert.strictEqual(friendData.nickname !== undefined);
                assert.strictEqual(friendData.avgMood !== undefined);
            }
        });

        it('好友情绪数据应该包含记录数量', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.friends.length > 0) {
                const friendData = res.body.friends[0];
                assert.strictEqual(friendData.recordCount !== undefined);
            }
        });

        it('好友情绪数据应该包含情绪趋势', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.friends.length > 0) {
                const friendData = res.body.friends[0];
                assert.strictEqual(friendData.moodTrend !== undefined);
            }
        });

        it('好友情绪数据应该包含热门关键词', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.friends.length > 0) {
                const friendData = res.body.friends[0];
                assert.ok(Array.isArray(friendData.topKeywords));
            }
        });
    });

    describe('好友列表API测试', () => {
        it('应该可以获取好友列表', async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });

            const res = await request(app)
                .get('/api/friends')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body));
        });

        it('好友列表应该包含用户名和昵称', async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });

            const res = await request(app)
                .get('/api/friends')
                .set('Authorization', `Bearer ${testToken}`);
            
            if (res.body.length > 0) {
                const friend = res.body[0];
                assert.ok(friend.id);
                assert.ok(friend.nickname);
                assert.ok(friend.username);
            }
        });

        it('没有好友时应该返回空数组', async () => {
            const res = await request(app)
                .get('/api/friends')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.body, []);
        });
    });

    describe('添加好友功能测试', () => {
        it('应该可以成功添加好友', async () => {
            const res = await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });
            
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.message, '添加成功');
            assert.ok(res.body.friend);
        });

        it('不应该添加不存在的用户', async () => {
            const res = await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'nonexistentuser' });
            
            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.error);
        });

        it('不应该添加自己为好友', async () => {
            const res = await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'testuser' });
            
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.error, '不能添加自己为好友');
        });

        it('不应该重复添加同一个好友', async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });

            const res = await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });
            
            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.error, '已经是好友了');
        });
    });

    describe('统计计算准确性测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend1' });

            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${testToken}`)
                .send({ friendUsername: 'friend2' });
        });

        it('应该正确统计好友总数', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(res.body.stats.totalFriends, 2);
        });

        it('应该正确统计低情绪好友数量', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(typeof res.body.stats.lowMoodFriends === 'number');
        });

        it('应该正确统计高情绪好友数量', async () => {
            const res = await request(app)
                .get('/api/friends/moods')
                .set('Authorization', `Bearer ${testToken}`);
            
            assert.strictEqual(typeof res.body.stats.highMoodFriends === 'number');
        });
    });
});
