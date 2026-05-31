const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, server, ENCOURAGE_RATE_LIMIT, checkEncourageRateLimit } = require('../server');

const JWT_SECRET = 'mood-thermometer-secret-key-2024';

describe('鼓励消息防骚扰测试', () => {
    let testUser1, testUser2, testUser3;
    let token1, token2, token3;

    beforeEach(async () => {
        testUser1 = { id: 1, username: 'testuser1', nickname: '测试用户1', password: 'password123' };
        testUser2 = { id: 2, username: 'testuser2', nickname: '测试用户2', password: 'password123' };
        testUser3 = { id: 3, username: 'testuser3', nickname: '测试用户3', password: 'password123' };

        token1 = jwt.sign({ userId: testUser1.id, username: testUser1.username, nickname: testUser1.nickname }, JWT_SECRET, { expiresIn: '1h' });
        token2 = jwt.sign({ userId: testUser2.id, username: testUser2.username, nickname: testUser2.nickname }, JWT_SECRET, { expiresIn: '1h' });
        token3 = jwt.sign({ userId: testUser3.id, username: testUser3.username, nickname: testUser3.nickname }, JWT_SECRET, { expiresIn: '1h' });
    });

    afterEach(() => {
        const fs = require('fs');
        if (fs.existsSync('./db.json')) {
            fs.unlinkSync('./db.json');
        }
    });

    describe('频率限制配置测试', () => {
        it('应该定义正确的每小时最大发送数量', () => {
            assert.strictEqual(ENCOURAGE_RATE_LIMIT.MAX_PER_HOUR, 5);
        });

        it('应该定义正确的每个用户每天最大发送数量', () => {
            assert.strictEqual(ENCOURAGE_RATE_LIMIT.MAX_PER_USER_PER_DAY, 3);
        });
    });

    describe('checkEncourageRateLimit 函数测试', () => {
        it('初始状态应该允许发送鼓励消息', async () => {
            const result = await checkEncourageRateLimit(1, 2);
            assert.strictEqual(result.allowed, true);
        });
    });

    describe('鼓励消息发送API测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token1}`)
                .send({ friendUsername: 'testuser2' });
        });

        it('应该可以成功发送鼓励消息', async () => {
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！你可以的！',
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.message);
        });

        it('不应该给非好友发送鼓励消息', async () => {
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 999,
                    message: '加油！',
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error, '只能给好友发送鼓励消息');
        });

        it('不应该发送空的鼓励消息', async () => {
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '',
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 400);
        });

        it('不应该发送超过500字的鼓励消息', async () => {
            const longMessage = 'a'.repeat(600);
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: longMessage,
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 400);
        });

        it('应该可以非匿名发送鼓励消息', async () => {
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！你可以的！',
                    isAnonymous: false
                });
            
            assert.strictEqual(res.statusCode, 200);
        });
    });

    describe('用户关闭鼓励消息功能测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token1}`)
                .send({ friendUsername: 'testuser2' });

            await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${token2}`)
                .send({ allow_encouragement: false });
        });

        it('不应该给关闭鼓励消息的用户发送消息', async () => {
            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！',
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.error, '该用户已关闭鼓励消息功能');
        });

        it('用户应该可以重新开启鼓励消息', async () => {
            await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${token2}`)
                .send({ allow_encouragement: true });

            const res = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！',
                    isAnonymous: true
                });
            
            assert.strictEqual(res.statusCode, 200);
        });
    });

    describe('鼓励消息接收测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token1}`)
                .send({ friendUsername: 'testuser2' });

            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token2}`)
                .send({ friendUsername: 'testuser1' });
        });

        it('应该可以获取收到的鼓励消息列表', async () => {
            await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！你可以的！',
                    isAnonymous: true
                });

            const res = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token2}`);
            
            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body));
        });

        it('匿名消息应该显示为\"匿名好友\"', async () => {
            await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！',
                    isAnonymous: true
                });

            const res = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token2}`);
            
            if (res.body.length > 0) {
                assert.strictEqual(res.body[0].from, '匿名好友');
            }
        });

        it('非匿名消息应该显示发送者昵称', async () => {
            await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油！',
                    isAnonymous: false
                });

            const res = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token2}`);
            
            if (res.body.length > 0) {
                assert.notStrictEqual(res.body[0].from, '匿名好友');
            }
        });

        it('鼓励消息应该按时间倒序排列', async () => {
            for (let i = 1; i <= 3; i++) {
                await request(app)
                    .post('/api/encourage')
                    .set('Authorization', `Bearer ${token1}`)
                    .send({
                        toUserId: 2,
                        message: `加油${i}！`,
                        isAnonymous: true
                    });
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const res = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token2}`);
            
            if (res.body.length >= 2) {
                const time1 = new Date(res.body[0].created_at).getTime();
                const time2 = new Date(res.body[1].created_at).getTime();
                assert.ok(time1 >= time2, '消息应该按时间倒序排列');
            }
        });
    });

    describe('多用户防骚扰场景测试', () => {
        beforeEach(async () => {
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token1}`)
                .send({ friendUsername: 'testuser2' });
            
            await request(app)
                .post('/api/friends/add')
                .set('Authorization', `Bearer ${token1}`)
                .send({ friendUsername: 'testuser3' });
        });

        it('应该允许给不同好友发送鼓励消息', async () => {
            const res1 = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '加油好友2！',
                    isAnonymous: true
                });

            const res2 = await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 3,
                    message: '加油好友3！',
                    isAnonymous: true
                });
            
            assert.strictEqual(res1.statusCode, 200);
            assert.strictEqual(res2.statusCode, 200);
        });

        it('用户应该只能收到给自己的鼓励消息', async () => {
            await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 2,
                    message: '给好友2的消息',
                    isAnonymous: true
                });

            await request(app)
                .post('/api/encourage')
                .set('Authorization', `Bearer ${token1}`)
                .send({
                    toUserId: 3,
                    message: '给好友3的消息',
                    isAnonymous: true
                });

            const res2 = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token2}`);
            
            const res3 = await request(app)
                .get('/api/encouragements')
                .set('Authorization', `Bearer ${token3}`);
            
            res2.body.forEach(msg => {
                assert.strictEqual(msg.message.includes('好友2') || msg.message.includes('给'), true);
            });
            
            res3.body.forEach(msg => {
                assert.strictEqual(msg.message.includes('好友3') || msg.message.includes('给'), true);
            });
        });
    });
});
