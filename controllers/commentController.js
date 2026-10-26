const { Comment, Post } = require('../models');

// @desc    Add a comment or reply to a post
// @route   POST /api/comments/:postId
// @access  Private
const addComment = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { textContent, parentId } = req.body;

    if (!textContent) {
      return res.status(400).json({ status: 'error', message: 'Comment text cannot be empty' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ status: 'error', message: 'Post not found' });
    }

    const comment = await Comment.create({
      post: postId,
      user: req.user._id,
      textContent,
      parentId: parentId || null,
    });

    // কমেন্ট তৈরি হওয়ার পর ইউজারের ডিটেইলস সহ রেসপন্স পাঠানো
    const populatedComment = await comment.populate('user', 'name username avatarUrl');

    res.status(201).json({ status: 'success', data: populatedComment });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all comments for a post (Nested structure)
// @route   GET /api/comments/:postId
// @access  Private
const getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;

    // সব কমেন্ট নিয়ে আসা (নতুনগুলো আগে), ইউজারের নাম ও ছবি populate করা
    const comments = await Comment.find({ post: postId })
      .sort({ createdAt: -1 })
      .populate('user', 'name username avatarUrl');

    // Nested Structure তৈরি করা (Parent-Child Relationship)
    const commentMap = {};
    const rootComments = [];

    // ১. প্রথমে সব কমেন্টকে একটি ম্যাপে রাখা
    comments.forEach((comment) => {
      commentMap[comment._id] = { ...comment._doc, replies: [] };
    });

    // ২. এখন চিল্ড্রেন কমেন্টগুলোকে প্যারেন্টের সাথে যুক্ত করা
    comments.forEach((comment) => {
      if (comment.parentId) {
        if (commentMap[comment.parentId]) {
          commentMap[comment.parentId].replies.push(commentMap[comment._id]);
        }
      } else {
        rootComments.push(commentMap[comment._id]);
      }
    });

    res.status(200).json({
      status: 'success',
      results: rootComments.length,
      data: rootComments, // শুধু রুট কমেন্টগুলো রেসপন্সে যাবে, রিপ্লাইগুলো তার ভেতরে থাকবে
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Edit a comment
// @route   PUT /api/comments/:commentId
// @access  Private
const editComment = async (req, res, next) => {
  try {
    const { textContent } = req.body;
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only edit your own comments' });
    }

    if (!textContent) {
      return res.status(400).json({ status: 'error', message: 'Comment text cannot be empty' });
    }

    comment.textContent = textContent;
    await comment.save();

    res.status(200).json({ status: 'success', data: comment });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:commentId
// @access  Private
const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }

    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'You can only delete your own comments' });
    }

    // যদি এটি প্যারেন্ট কমেন্ট হয়, তবে এর সব রিপ্লাইও ডিলিট করে দেওয়া হবে
    if (!comment.parentId) {
      await Comment.deleteMany({ parentId: comment._id });
    }

    await comment.deleteOne();

    res.status(200).json({ status: 'success', message: 'Comment (and its replies) deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = { addComment, getComments, editComment, deleteComment };