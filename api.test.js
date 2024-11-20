const request = require('supertest');
require('dotenv/config');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// The user details used later in the tests
const testUsers = [
    { username: 'Olga', first_name: 'Olga', last_name: 'Smith', email: 'olga@test.com', password: 'password123' },
    { username: 'Nick', first_name: 'Nick', last_name: 'Bates', email: 'nick@test.com', password: '123456' },
    { username: 'Mary', first_name: 'Mary', last_name: 'Williams', email: 'mary@test.com', password: '987654' },
    { username: 'Nestor', first_name: 'Nestor', last_name: 'Smestor', email: 'nestor@test.com', password: 'Nestor123' }
];

// For storing the tokens and the ids
let authTokens = {};
let userIds = {};

describe('API route integration testing for Piazza API', () => {
    // Registers all the users and logs them in
    beforeAll(async () => {
        for (const user of testUsers) {
            await request(BASE_URL).post('/api/user/register').send(user);
            const loginRes = await request(BASE_URL).post('/api/user/login')
                .send({email: user.email, password: user.password})
            // The tokens are then stored for later use
            authTokens[user.username] = loginRes.body['auth-token'];
            // userIds are also stored
            const userIdRes = await request(BASE_URL)
                .get(`/api/user/${user.username}`)
                .set('auth-token', authTokens[user.username]);
            userIds[user.username] = userIdRes.body._id;
        }
    });
    // TC 1. Olga, Nick, Mary, and Nestor register and are ready to access the Piazza API.
    it('should return each users details, the same that were inputted', async () => {
        for (const user of testUsers) {
            // Gets the user info
            const res = await request(BASE_URL)
                .get(`/api/user/${user.username}`)
                .set('auth-token', authTokens[user.username]);
            expect(res.status).toBe(200);
            expect(res.body.username).toBe(user.username);
            expect(res.body.first_name).toBe(user.first_name);
            expect(res.body.last_name).toBe(user.last_name);
            expect(res.body.email).toBe(user.email);
        }
    });
    // TC 2. Olga, Nick, Mary, and Nestor use the oAuth v2 authorisation service to register and get
    // their tokens.
    it('should show that each user has an auth token', async () => {
        for (const user of testUsers) {
            expect(authTokens[user.username]).toBeDefined();
        }
    });
    // TC 3. Olga makes a call to the API without using her token. This call should be unsuccessful as
    // the user is unauthorised.
    it('should fail as she does not have a token', async () => {
        const res = await request(BASE_URL)
            .get(`/api/posts`)
        expect(res.status).toBe(401);
    });
    // TC 4. Olga posts a message in the Tech topic with an expiration time (e.g. 5 minutes) using her
    // token. After the end of the expiration time, the message will not accept any further user
    // interactions (likes, dislikes, or comments).
    it('should not accept the interaction or comment after the ' +
        'expiration time has been changed to expired', async () => {
        const postData = {
            "title": "My mum just bought me an Macbook",
            "topic": ["Tech"],
            "body": "I love it",
            "expiry_minutes": 5
        }
        const res = await request(BASE_URL)
            .post(`/api/posts`)
            .set('auth-token', authTokens['Olga'])
            .send(postData);
        expect(res.status).toBe(201);
        // Here I also test the time to make sure the time of the expiration would be five minutes
        // if I was not about to skip it. I did so by subtracting the time between the expiration time
        // and the upload time, it should be roughly 5 minutes
        const timeDifference = new Date(res.body.expiry_time).getTime() - new Date(res.body.upload_time).getTime();
        const differenceInMinutes = timeDifference / 60000;
        expect(differenceInMinutes).toBeGreaterThan(4);
        expect(differenceInMinutes).toBeLessThan(6);

        // Simulates the expiration time running out by changing the expiration time
        const updatePostData = {
            "expiry_minutes": -1
        }
        const updateRes = await request(BASE_URL)
            .patch(`/api/posts/${res.body._id}`)
            .set('auth-token', authTokens['Olga'])
            .send(updatePostData);
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.status).toEqual(['Expired']);
        // Test the interaction after the post has expired, should not go through
        const interactionData = {
            "type": "like"
        }
        const expiredInteractionRes = await request(BASE_URL)
            .post(`/api/posts/${res.body._id}`)
            .set('auth-token', authTokens['Nick'])
            .send(interactionData);
        expect(expiredInteractionRes.status).toBe(403);
        // Also tests the comment to see that that is also blocked
        const commentData = {
            "body": "Me too"
        }
        const commentRes = await request(BASE_URL)
            .post(`/api/posts/${res.body._id}/comments`)
            .set('auth-token', authTokens['Mary'])
            .send(commentData);
        expect(commentRes.status).toBe(403);
    });
    // TC 5. Nick posts a message in the Tech topic with an expiration time using his token.
    it('should post a message with Nick\'s token under the Tech topic that has an expiration time', async () => {
        // Simple post and submit with Nick's auth token
        const postData = {
            "title": "What is the best laptop to buy?",
            "topic": ["Tech"],
            "body": "I'm looking for a relatively cheap laptop to buy, can anyone help me?",
            "expiry_minutes": 60
        }
        const res = await request(BASE_URL)
            .post(`/api/posts`)
            .set('auth-token', authTokens['Nick'])
            .send(postData);
    // Check the post was accepted
    expect(res.status).toBe(201);
    // Checks the time is roughly 60 minutes
    const timeDifference = new Date(res.body.expiry_time).getTime() - new Date(res.body.upload_time).getTime();
    const differenceInMinutes = timeDifference / 60000;
    expect(differenceInMinutes).toBeGreaterThan(59);
    expect(differenceInMinutes).toBeLessThan(61);
    });
    // TC 6. Mary posts a message in the Tech topic with an expiration time using her token.
    it('should post a message with Mary\'s token under the Tech topic that has an expiration time', async () => {
        // Simple post and submit with Mary's auth token
        const postData = {
            "title": "What do you think about AI?",
            "topic": ["Tech"],
            "body": "I'm a bit cautious about it",
            "expiry_minutes": 80
        }
        const res = await request(BASE_URL)
            .post(`/api/posts`)
            .set('auth-token', authTokens['Mary'])
            .send(postData);
        expect(res.status).toBe(201);
        // Checks the time is roughly 80 minutes
        const timeDifference = new Date(res.body.expiry_time).getTime() - new Date(res.body.upload_time).getTime();
        const differenceInMinutes = timeDifference / 60000;
        expect(differenceInMinutes).toBeGreaterThan(79);
        expect(differenceInMinutes).toBeLessThan(81);
    });
    // TC 7. Nick and Olga browse all the available posts in the Tech topic; three posts should have zero
    // likes, zero dislikes, and no comments.
    it('should show three posts that have zero likes, zero dislikes and no comments', async () => {
        const olgaRes = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Olga']);
        expect(olgaRes.status).toBe(200);

        const nickRes = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Nick']);
        expect(nickRes.status).toBe(200);
        // Shows 3 posts are there (can be checked by either Nick's or Olga's responses)
        expect(nickRes.body.length).toBe(3);
        // Looks at the likes total should be 0
        for (const post of nickRes.body) {
            expect(post.like_count).toBe(0);
        }
        // Looks at the dislikes total should be 0
        for (const post of nickRes.body) {
            expect(post.dislike_count).toBe(0);
        }
        // Looks at the comment total should be 0
        for (const post of nickRes.body) {
            expect(post.comments.length).toBe(0);
        }
    });
    // TC 8. Nick and Olga “like” Mary’s post on the Tech topic.
    it('should accept the two likes', async () => {
        // Gets Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Olga']);
        expect(res.status).toBe(200);
        let marysPost;
        for (const post of res.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;
            }
        }
        // Adds likes by both Olga and Nick
        const likeData = {
            "type" : "like"
        }
        const olgaRes = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Olga'])
            .send(likeData);
        expect(olgaRes.status).toBe(201);

        const nickRes = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Nick'])
            .send(likeData);;
        expect(nickRes.status).toBe(201);
    });
    // TC 9. Nestor “likes” Nick’s post and “dislikes” Mary’s on the Tech topic.
    it('should accept the Nestor\'s like and dislike', async () => {
        // Gets Nick and Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Nestor']);
        expect(res.status).toBe(200);
        let nicksPost;
        for (const post of res.body) {
            if(post.user === userIds['Nick']) {
                nicksPost = post;
                break;
            }
        }
        let marysPost;
        for (const post of res.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;
            }
        }
        // Adds like to Nick's post
        const likeData = {
            "type" : "like"
        }
        const nickRes = await request(BASE_URL)
            .post(`/api/posts/${nicksPost._id}`)
            .set('auth-token', authTokens['Nestor'])
            .send(likeData);
        expect(nickRes.status).toBe(201);
        // Adds dislike to Mary's post
        const dislikeData = {
            "type" : "dislike"
        }
        const maryRes = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Nestor'])
            .send(dislikeData);
        expect(maryRes.status).toBe(201);
    });
    // TC 10. Nick browses all the available posts on the Tech topic; at this stage, he can see the number
    // of likes and dislikes for each post (Mary has two likes and one dislike, and Nick has one
    // like). No comments have been made yet.
    it('should show two likes and one dislike on Mary\'s post and one like on Nick\'s post', async () => {
        // Gets Nick and Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Nestor']);
        expect(res.status).toBe(200);
        let marysPost;
        let nicksPost;
        for (const post of res.body) {
            if (post.user === userIds['Mary']) {
                marysPost = post;
            }
            if (post.user === userIds['Nick']) {
                nicksPost = post;
            }
        }
        // Compares the likes and dislikes on both of the posts
        expect(marysPost.like_count).toBe(2);
        expect(marysPost.dislike_count).toBe(1);
        expect(nicksPost.like_count).toBe(1);
    });
    // TC 11. Mary likes her post on the Tech topic. This call should be unsuccessful; in Piazza, a post
    // owner cannot like their messages.
    it('should reject Mary\'s attempt to like her own post', async () => {
        // Gets Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Mary']);
        expect(res.status).toBe(200);
        let marysPost;
        for (const post of res.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;}
        }
        // Tries to add Mary's like to the post
        const likeData = {
            "type" : "like"
        }
        const likeRes = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Mary'])
            .send(likeData);
        expect(likeRes.status).toBe(400);
        expect(likeRes.body.message).toBe('You cannot interact with your own post');
    });
    // TC 12. Nick and Olga comment on Mary’s post on the Tech topic in a round-robin fashion (one
    // after the other, adding at least two comments each).
    it('should allow two comments from Olga and Nick one after the other', async () => {
        // Gets Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Olga']);
        expect(res.status).toBe(200);
        let marysPost;
        for (const post of res.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;}
        }
        // Adds each comment to the post
        const NickCommentData1 = {
            "comment_body": "I'm a little worried it will take my job"
        }
        const OlgaCommentData1 = {
            "comment_body": "I hope it takes my job! One day"
        }
        const NickCommentData2 = {
            "comment_body": "Until you're starving because you have no money"
        }
        const OlgaCommentData2 = {
            "comment_body": "I can just eat robofood"
        }
        const comment1Res = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Nick'])
            .send(NickCommentData1);
        expect(comment1Res.status).toBe(201);

        const comment2Res = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Olga'])
            .send(OlgaCommentData1);
        expect(comment2Res.status).toBe(201);

        const comment3Res = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Nick'])
            .send(NickCommentData2);
        expect(comment3Res.status).toBe(201);

        const comment4Res = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Olga'])
            .send(OlgaCommentData2);
        expect(comment4Res.status).toBe(201);

    });

    // TC 13. Olga deletes her last comment with her token, the number of comments should be 3
    it('should successfully delete the comment and show one less comment', async () => {
        // Gets the post then the comment
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Olga']);
        expect(res.status).toBe(200);
        let marysPost;
        for (const post of res.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;}
        }
        const getRes1 = await request(BASE_URL)
            .get(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Olga'])
        expect(getRes1.status).toBe(200);
        olgasLastComment = getRes1.body[3];
        // Deletes the comment and checks if there are 3 afterwards
        const deleteRes = await request(BASE_URL)
            .delete(`/api/posts/${marysPost._id}/comments/${olgasLastComment._id}`)
            .set('auth-token', authTokens['Olga'])
        expect(deleteRes.status).toBe(200);
        const getRes2 = await request(BASE_URL)
            .get(`/api/posts/${marysPost._id}/comments`)
            .set('auth-token', authTokens['Olga'])
        expect(getRes2.status).toBe(200);
        expect(getRes2.body.length).toBe(3);
    })


    // TC 14. Nick browses all the available posts in the Tech topic; at this stage, he can see the number
    // of likes and dislikes of each post and the comments made.
    it('should show the likes and dislikes and also show that there are 4 comments present', async () => {
        // Gets Nick and Mary's post from the tech topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Nick']);
        expect(res.status).toBe(200);
        let marysPost;
        let nicksPost;
        for (const post of res.body) {
            if (post.user === userIds['Mary']) {
                marysPost = post;
            }
            if (post.user === userIds['Nick']) {
                nicksPost = post;
            }
        }
        // Compares the likes and dislikes on both of the posts
        expect(marysPost.like_count).toBe(2);
        expect(marysPost.dislike_count).toBe(1);
        expect(nicksPost.like_count).toBe(1);
        // Checks the amount of comments
        expect(marysPost.comments.length).toBe(4);
    });
    // TC 15. Nestor posts a message on the Health topic with an expiration time using her token.
    it('should post a message with Nestor\'s token under the Health topic that has an expiration time', async () => {
        // Simple post and submit with Nestor's auth token to Health topic
        const postData = {
            "title": "I think people should eat less fast food",
            "topic": ["Health"],
            "body": "It is so unhealthy",
            "expiry_minutes": 90
        }
        const res = await request(BASE_URL)
            .post(`/api/posts`)
            .set('auth-token', authTokens['Nestor'])
            .send(postData);
        expect(res.status).toBe(201);
        // Checks the time is roughly 90 minutes
        const timeDifference = new Date(res.body.expiry_time).getTime() - new Date(res.body.upload_time).getTime();
        const differenceInMinutes = timeDifference / 60000;
        expect(differenceInMinutes).toBeGreaterThan(89);
        expect(differenceInMinutes).toBeLessThan(91);
    });
    // TC 16. Mary browses all the available posts on the Health topic; at this stage, she can see only
    // Nestor’s post.
    it('should get the posts in the Health topic which should be only 1 post', async () => {
        // Gets the posts under the health topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/health`)
            .set('auth-token', authTokens['Mary']);
        expect(res.status).toBe(200);
        // Checks that there is only one
        expect(res.body.length).toBe(1);
    });
    // TC 17. Mary posts a comment in Nestor’s message on the Health topic.
    it('should accept Mary\'s comment', async () => {
        // Gets Nestor's post from the health topic
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/health`)
            .set('auth-token', authTokens['Mary']);
        expect(res.status).toBe(200);
        let nestorsPost;
        for (const post of res.body) {
            if(post.user === userIds['Nestor']) {
                nestorsPost = post;
                break;
            }
        }
        // Adds a comment to the post
        const commentData = {
            "comment_body": "Don't tell me what to do, ok?"
        }
        const commentRes = await request(BASE_URL)
            .post(`/api/posts/${nestorsPost._id}/comments`)
            .set('auth-token', authTokens['Mary'])
            .send(commentData);
        expect(commentRes.status).toBe(201);
    });
    // TC 18. Mary dislikes Nestor’s message on the Health topic after the end of post-expiration time.
    // This should fail.
    it('should not accept the dislike on Nestor\'s post', async () => {
    // Gets Nestor's post from the health topic
    const res = await request(BASE_URL)
        .get(`/api/posts/topic/health`)
        .set('auth-token', authTokens['Mary']);
    expect(res.status).toBe(200);
    let nestorsPost;
    for (const post of res.body) {
        if(post.user === userIds['Nestor']) {
            nestorsPost = post;
            break;
        }
    }
    // Simulates the expiration time running out by changing the expiration time
    const updatePostData = {
        "expiry_minutes": -1
    }
    const updateRes = await request(BASE_URL)
        .patch(`/api/posts/${nestorsPost._id}`)
        .set('auth-token', authTokens['Nestor'])
        .send(updatePostData);
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toEqual(['Expired']);
    // Test the dislike after the post has expired, should not go through
    const dislikeData = {
        "type": "dislike"
    }
    const expiredInteractionRes = await request(BASE_URL)
        .post(`/api/posts/${nestorsPost._id}`)
        .set('auth-token', authTokens['Mary'])
        .send(dislikeData);
    expect(expiredInteractionRes.status).toBe(403);
    });
    // TC 19. Nestor browses all the messages on the Health topic. There should be only one post (his
    // own) with one comment (Mary’s).
    it('should show 1 post and 1 comment in the health topic', async () => {
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/health`)
            .set('auth-token', authTokens['Nestor']);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].comments.length).toBe(1);
    });
    // TC 20. Nick browses all the expired messages on the Sports topic. These should be empty.
    it('should show no posts', async () => {
        // Have to create and delete a new post as the test will pass if there is nothing
        // for any reason and therefore might be testing for something else
        const postData = {
            "title": "test post",
            "topic": ["Sport"],
            "body": "test post",
            "expiry_minutes": -1,
        }
        const testRes1 = await request(BASE_URL)
            .post(`/api/posts`)
            .set('auth-token', authTokens['Nick'])
            .send(postData);
        expect(testRes1.status).toBe(201);
        const testRes2 = await request(BASE_URL)
            .get(`/api/posts/topic/sport?expired=true`)
            .set('auth-token', authTokens['Nick']);
        expect(testRes2.status).toBe(200);
        expect(testRes2.body.length).toBe(1);
        const deletionRes = await request(BASE_URL)
            .delete(`/api/posts/${testRes2.body[0]._id}`)
            .set('auth-token', authTokens['Nick']);
        expect(deletionRes.status).toBe(200);
        // End of the creation and deletion

        // Test that there are no posts
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/sport?expired=true`)
            .set('auth-token', authTokens['Nick']);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(0);
    });
    // TC 21. Nestor queries for an active post with the highest interest (maximum number of likes and
    // dislikes) in the Tech topic. This should be Mary’s post.
    it('should show Mary\'s post when queried for the post with the highest interaction', async () => {
        const res = await request(BASE_URL)
            .get(`/api/posts/topic/tech/top-post`)
            .set('auth-token', authTokens['Nestor']);
        expect(res.status).toBe(200);
        expect(res.body.user).toBe(userIds['Mary']);
    });

    // TC 22. Nestor changes his dislike on Mary's post to a like and then changes
    // his mind and removes it, the number of dislikes should drop while the likes stays the same
    it('should successfully like the post and get rid of the like too', async () => {
        // Gets Mary's post from the tech topic
        const getRes1 = await request(BASE_URL)
            .get(`/api/posts/topic/tech`)
            .set('auth-token', authTokens['Nestor']);
        expect(getRes1.status).toBe(200);
        let marysPost;
        for (const post of getRes1.body) {
            if(post.user === userIds['Mary']) {
                marysPost = post;
                break;}
        }
        const getRes2 = await request(BASE_URL)
            .get(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Nestor']);
        expect(getRes2.status).toBe(200);
        const previousLikeCount = getRes2.body.like_count;
        const previousDislikeCount = getRes2.body.dislike_count;
        // Adds Nestor's like to the post
        const likeData = {
            "type" : "like"
        }
        const likeRes = await request(BASE_URL)
            .post(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Nestor'])
            .send(likeData);
        console.log(likeRes.body);
        expect(likeRes.status).toBe(200);
        const nestorsInteraction = likeRes.body.interaction;
        // Deletes the interaction
        const deleteLikeRes = await request(BASE_URL)
            .delete(`/api/posts/${marysPost._id}/${nestorsInteraction._id}`)
            .set('auth-token', authTokens['Nestor']);
        expect(deleteLikeRes.status).toBe(200);
        const getRes3 = await request(BASE_URL)
            .get(`/api/posts/${marysPost._id}`)
            .set('auth-token', authTokens['Nestor']);
        expect(getRes3.status).toBe(200);
        expect(getRes3.body.like_count).toBe(previousLikeCount);
        expect(getRes3.body.dislike_count).toBe(previousDislikeCount - 1);
    })

    // TC 23. Nestor deletes his post on the Health topic, this should leave no posts on the Health topic
    it('should successfully delete the post and show no posts in the health topic', async () => {
        // Gets Nestor's post
        const getRes1 = await request(BASE_URL)
            .get(`/api/posts/topic/health`)
            .set('auth-token', authTokens['Nestor']);
        expect(getRes1.status).toBe(200);
        let nestorsPost;
        for (const post of getRes1.body) {
            if(post.user === userIds['Nestor']) {
                nestorsPost = post;
                break;}
        }
        // Deletes the post
        const deleteRes = await request(BASE_URL)
            .delete(`/api/posts/${nestorsPost._id}`)
            .set('auth-token', authTokens['Nestor']);
        expect(deleteRes.status).toBe(200);
        // Checks if there are no posts now
        const getRes2 = await request(BASE_URL)
            .get(`/api/posts/topic/health`)
            .set('auth-token', authTokens['Nestor']);
        expect(getRes2.status).toBe(200);
        expect(getRes2.body.length).toBe(0);
    })
    // Deletes all the created users and their posts, interactions and comments
    afterAll(async () => {
        for (const user of testUsers) {
            await request(BASE_URL).delete(`/api/user/${userIds[user.username]}`)
                .set('auth-token', authTokens[user.username])
        }
    });
});