const { Post, User } = require('../models');
const cloudinary = require('../config/cloudinaryConfig'); 

// @desc    Create a new post
const createPost = async (req, res, next) => {
  try {
    const { textContent, mediaUrl, mediaType, visibility, mediaPublicId } = req.body;

    if (!textContent && !mediaUrl) {
       return res.status(400).json({ status: 'error', message: 'Post must contain either text content or media' });
    }

    if (mediaUrl && !mediaUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ status: 'error', message: 'Invalid media URL. Only Cloudinary URLs are allowed.' });
    }

    const post = await Post.create({
      user: req.user._id,
      textContent,
      mediaUrl,
      mediaType,
      visibility,
      mediaPublicId: mediaPublicId || null, 
    });

    res.status(201).json({ status: 'success', data: post });
  } catch (error) {
    next(error);
  }
};

// @desc    Get timeline feed with Privacy Filter (With Pagination)
const getFeed = async (req, res, next) => {
  try {
    const loggedInUserId = req.user._id;
    
    const loggedInUser = await User.findById(loggedInUserId).select('friends');
    const userFriends = loggedInUser.friends; 

    const lockedUsers = await User.find({
      isProfileLocked: true,
      _id: { $nin: [...userFriends, loggedInUserId] } 
    }).select('_id');

    const lockedUserIds = lockedUsers.map(u => u._id);

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); 
    const skip = (page - 1) * limit;

    const query = {
      user: { $nin: lockedUserIds },
      $or: [
        { visibility: 'public' },
        { user: loggedInUserId },
        { 
          visibility: 'friends', 
          user: { $in: userFriends }
        }
      ]
    };

    const totalPosts = await Post.countDocuments(query);

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatarUrl isProfileLocked')
      .populate('reactions.user', 'name username');

    res.status(200).json({
      status: 'success',
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalResults: totalPosts,
      results: posts.length,
      data: posts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Edit a post
const editPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only edit your own posts' });
    }

    if (req.body.mediaUrl && !req.body.mediaUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ status: 'error', message: 'Invalid media URL. Only Cloudinary URLs are allowed.' });
    }

    post.textContent = req.body.textContent || post.textContent;
    post.mediaUrl = req.body.mediaUrl || post.mediaUrl;
    post.mediaType = req.body.mediaType || post.mediaType;
    post.visibility = req.body.visibility || post.visibility;

    await post.save();

    // 👈 নতুন যোগ করা হলো: রেসপন্স পাঠানোর আগে populate করা হচ্ছে
    await post.populate('user', 'name username avatarUrl isProfileLocked');
    await post.populate('reactions.user', 'name username');

    res.status(200).json({ status: 'success', data: post });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a post
const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own posts' });
    }

    if (post.mediaPublicId) {
      try {
        await cloudinary.uploader.destroy(post.mediaPublicId);
        console.log(`🗑️ Media deleted from Cloudinary for Post: ${post.mediaPublicId}`);
      } catch (err) {
        console.error('Failed to delete media from Cloudinary:', err);
      }
    }

    await post.deleteOne();
    res.status(200).json({ status: 'success', message: 'Post deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    React to a post (Multiple Reactions)
const reactToPost = async (req, res, next) => {
  try {
    const { reactionType } = req.body;
    const allowedReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];

    if (!allowedReactions.includes(reactionType)) {
      return res.status(400).json({ status: 'error', message: 'Invalid reaction type' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    const existingReactionIndex = post.reactions.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (existingReactionIndex > -1) {
      if (post.reactions[existingReactionIndex].type === reactionType) {
        post.reactions.splice(existingReactionIndex, 1);
      } else {
        post.reactions[existingReactionIndex].type = reactionType; 
      }
    } else {
      post.reactions.push({ user: req.user._id, type: reactionType });
    }

    await post.save();

    // 👈 নতুন যোগ করা হলো: রেসপন্স পাঠানোর আগে populate করা হচ্ছে
    await post.populate('user', 'name username avatarUrl isProfileLocked');
    await post.populate('reactions.user', 'name username');

    res.status(200).json({ status: 'success', data: post });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a specific post by ID with strict privacy filter
const getSinglePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'name username avatarUrl isProfileLocked friends blockedUsers')
      .populate('reactions.user', 'name username');

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    const loggedInUserId = req.user._id.toString();
    const postAuthorId = post.user._id.toString();

    const loggedInUser = await User.findById(loggedInUserId).select('friends blockedUsers');
    const authorBlockedMe = post.user.blockedUsers.some((id) => id.toString() === loggedInUserId);
    const iBlockedAuthor = loggedInUser.blockedUsers.some((id) => id.toString() === postAuthorId);

    if (authorBlockedMe || iBlockedAuthor) {
      return res.status(403).json({ status: 'error', message: 'Cannot view this post due to block settings' });
    }

    if (postAuthorId === loggedInUserId) {
      return res.status(200).json({ status: 'success', data: post });
    }

    const isFriend = loggedInUser.friends.some((id) => id.toString() === postAuthorId);

    if (post.user.isProfileLocked && !isFriend) {
      return res.status(403).json({ status: 'error', message: 'This post is not available (Profile is locked)' });
    }

    if (post.visibility === 'public') {
      return res.status(200).json({ status: 'success', data: post });
    }

    if (post.visibility === 'friends' && isFriend) {
      return res.status(200).json({ status: 'success', data: post });
    }

    return res.status(403).json({ status: 'error', message: 'You are not authorized to view this post' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all posts of a specific user (Privacy filtered + Pagination)
const getUserPosts = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId;
    const loggedInUserId = req.user._id.toString();

    const targetUser = await User.findById(targetUserId).select('isProfileLocked blockedUsers');
    if (!targetUser) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const loggedInUser = await User.findById(loggedInUserId).select('friends blockedUsers');

    const authorBlockedMe = targetUser.blockedUsers.some((id) => id.toString() === loggedInUserId);
    const iBlockedAuthor = loggedInUser.blockedUsers.some((id) => id.toString() === targetUserId);
    if (authorBlockedMe || iBlockedAuthor) {
      return res.status(403).json({ status: 'error', message: 'Cannot view posts due to block settings' });
    }

    const isSelf = targetUserId === loggedInUserId;
    const isFriend = loggedInUser.friends.some((id) => id.toString() === targetUserId);

    if (targetUser.isProfileLocked && !isFriend && !isSelf) {
      return res.status(403).json({ status: 'error', message: 'This profile is locked. Add as friend to view posts.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    let query = { user: targetUserId };
    
    if (!isSelf && !isFriend) {
      query.visibility = 'public';
    }

    const totalPosts = await Post.countDocuments(query);

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name username avatarUrl isProfileLocked')
      .populate('reactions.user', 'name username');

    res.status(200).json({
      status: 'success',
      currentPage: page,
      totalPages: Math.ceil(totalPosts / limit),
      totalResults: totalPosts,
      results: posts.length,
      data: posts,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 👈 নতুন যোগ করা হলো: Toggle Post Visibility
// ==========================================

// @desc    Quick toggle post visibility (public <-> friends)
// @route   PUT /api/posts/:id/visibility
// @access  Private
const togglePostVisibility = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    // শুধুমাত্র পোস্টের মালিক এটি পরিবর্তন করতে পারবে
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only change visibility of your own posts' });
    }

    // Visibility Toggle Logic (public <-> friends)
    post.visibility = post.visibility === 'public' ? 'friends' : 'public';
    await post.save();

    // 👈 নতুন যোগ করা হলো: রেসপন্স পাঠানোর আগে populate করা হচ্ছে
    await post.populate('user', 'name username avatarUrl isProfileLocked');
    await post.populate('reactions.user', 'name username');

    res.status(200).json({
      status: 'success',
      message: `Post visibility changed to ${post.visibility}`,
      data: post,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  createPost, 
  getFeed, 
  editPost, 
  deletePost, 
  reactToPost,
  getSinglePost,
  getUserPosts,
  togglePostVisibility 
};